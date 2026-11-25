// Received documents (räkenskapsinformation). The browser encrypts the file,
// uploads it to the vault, then confirms it here; accounting checks the vault's
// record before linking it.
import Array "mo:core/Array";
import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Keys "../lib/Keys";
import Roles "../lib/Roles";
import Vault "../lib/Vault";
import Types "../types";

mixin (roles : Types.Roles, ledger : Types.Ledger, files : Types.Files, counters : Types.Counters, audit : Types.Audit) {
  transient let MIME = ["application/pdf", "image/jpeg", "image/png", "image/heic", "application/xml", "text/xml"];
  transient let MAX_SIZE = 20_000_000;
  transient let MAX_TICKETS_PER_USER = 20;
  transient let TICKET_TTL : Int = 24 * 3_600_000_000_000;
  transient let attachVaultTimeoutSecs : Nat32 = 60;

  func checkMeta(m : Types.AttachmentMeta) : Result.Result<(), Types.Error> {
    if (m.filename.size() == 0 or m.filename.size() > 200) return #err(#invalid("filename"));
    if (MIME.find(func x = x == m.mime) == null) return #err(#invalid("mime"));
    if (m.size == 0 or m.size > MAX_SIZE) return #err(#invalid("size"));
    if (m.plainSha256.size() != 32) return #err(#invalid("plainSha256"));
    if (m.wrappedKey.size() == 0 or m.wrappedKey.size() > 512) return #err(#invalid("wrappedKey"));
    if (Keys.PURPOSES.find(func x = x == m.keyId) == null) return #err(#invalid("keyId"));
    #ok(());
  };

  public shared ({ caller }) func beginAttachment(meta : Types.AttachmentMeta) : async Result.Result<Nat, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    switch (checkMeta(meta)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    let now = Time.now();
    // Expired tickets go first so an abandoned upload doesn't count against the limit.
    let expired = files.tickets.entries().filter(func((_, t)) = now - t.at > TICKET_TTL).map(func((id, _)) = id).toArray();
    for (id in expired.values()) files.tickets.remove(id);
    let mine = files.tickets.values().filter(func(t : Types.Ticket) : Bool = t.by == caller).toArray().size();
    if (mine >= MAX_TICKETS_PER_USER) return #err(#invalid("tooManyUploads"));
    let id = counters.nextTicket;
    counters.nextTicket += 1;
    files.tickets.add(id, { meta; by = caller; at = now });
    #ok(id);
  };

  public shared ({ caller }) func confirmAttachment(ticket : Nat, vaultFileId : Nat) : async Result.Result<Types.Attachment, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let t = files.tickets.get(ticket) ?? (return #err(#notFound));
    if (t.by != caller) return #err(#notAuthorized);
    if (files.attachments.values().any(func(a : Types.Attachment) : Bool = a.vaultFileId == vaultFileId)) return #err(#conflict("file already linked"));
    let v = Vault.canister<system>() ?? (return #err(#vault("vault canister id not set")));
    // Taken before the await so the same ticket can't be confirmed twice.
    files.tickets.remove(ticket);
    let info = try {
      await (with timeout = attachVaultTimeoutSecs) v.fileInfo(vaultFileId);
    } catch e {
      files.tickets.add(ticket, t);
      return #err(#vault(e.message()));
    };
    let f = switch (info) {
      case (?f) { f };
      case null { files.tickets.add(ticket, t); return #err(#vault("file not found")) };
    };
    if (f.uploadedBy != caller or f.mime != t.meta.mime or f.size < t.meta.size) {
      files.tickets.add(ticket, t);
      return #err(#vault("file does not match the upload"));
    };
    if (files.attachments.values().any(func(a : Types.Attachment) : Bool = a.vaultFileId == vaultFileId)) return #err(#conflict("file already linked"));
    let now = Time.now();
    let a : Types.Attachment = { t.meta with id = counters.nextAttachment; vaultFileId; cipherSha256 = f.cipherSha256; uploadedAt = now; uploadedBy = caller };
    counters.nextAttachment += 1;
    files.attachments.add(a.id, a);
    ignore Audit.append(audit, now, caller, "attachment.add", "attachment", ?a.id, #obj([
      ("filename", #text(a.filename)), ("mime", #text(a.mime)), ("size", #int(a.size)),
      ("plainSha256", #blob(a.plainSha256)), ("cipherSha256", #blob(a.cipherSha256)), ("vaultFileId", #int(vaultFileId)),
    ]));
    #ok(a);
  };

  public shared query ({ caller }) func getAttachment(id : Nat) : async Result.Result<Types.Attachment, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    switch (files.attachments.get(id)) { case (?a) { #ok(a) }; case null { #err(#notFound) } };
  };

  /// Newest first.
  public shared query ({ caller }) func listAttachments(offset : Nat, limit : Nat) : async Result.Result<Types.Page<Types.Attachment>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let all = files.attachments.reverseEntries().map(func((_, a)) = a).toArray();
    #ok({ items = all.sliceToArray(offset, offset + Nat.min(limit, 200)); total = all.size() });
  };

  /// Links a document to a voucher after posting (the voucher itself stays unchanged).
  public shared ({ caller }) func linkAttachment(attachmentId : Nat, voucherId : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not files.attachments.containsKey(attachmentId)) return #err(#notFound);
    let v = ledger.vouchers.get(voucherId) ?? (return #err(#notFound));
    let linked = files.voucherLinks.get(voucherId) ?? [];
    if (v.attachmentIds.find(func x = x == attachmentId) != null or linked.find(func x = x == attachmentId) != null) return #err(#conflict("already linked"));
    files.voucherLinks.add(voucherId, linked.concat([attachmentId]));
    files.links.add(attachmentId, (files.links.get(attachmentId) ?? []).concat([#manual]));
    ignore Audit.append(audit, Time.now(), caller, "attachment.link", "attachment", ?attachmentId, #obj([("voucherId", #int(voucherId))]));
    #ok(());
  };

};
