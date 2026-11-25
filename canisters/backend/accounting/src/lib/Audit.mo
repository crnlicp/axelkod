// Behandlingshistorik: an append-only log where each entry hashes the previous
// one, so any later edit or removal breaks the chain.
import Array "mo:core/Array";
import Int "mo:core/Int";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Canonical "Canonical";
import Types "../types";

module {
  public let GENESIS : Blob = "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00";

  func body(e : { seq : Nat; at : Int; principal : Principal; action : Text; entity : Text; entityId : ?Nat; detailHash : Blob; prevHash : Blob }) : Canonical.Value {
    #obj([
      ("seq", #int(e.seq)),
      ("at", #int(e.at)),
      ("principal", Canonical.principal(e.principal)),
      ("action", #text(e.action)),
      ("entity", #text(e.entity)),
      ("entityId", Canonical.opt(e.entityId, Canonical.nat)),
      ("detailHash", #blob(e.detailHash)),
      ("prevHash", #blob(e.prevHash)),
    ]);
  };

  public func append(audit : Types.Audit, at : Int, principal : Principal, action : Text, entity : Text, entityId : ?Nat, detail : Canonical.Value) : Types.AuditEntry {
    let prevHash = switch (audit.last()) { case (?e) { e.hash }; case null { GENESIS } };
    let e = { seq = audit.size(); at; principal; action; entity; entityId; detailHash = Canonical.sha256(detail); prevHash };
    let entry = { e with hash = Canonical.sha256(body(e)) };
    audit.add(entry);
    entry;
  };

  /// First broken seq in [from, to), or null if the chain is intact there.
  public func verify(audit : Types.Audit, from : Nat, to : Nat) : ?Nat {
    let end = Nat.min(to, audit.size());
    var i = from;
    var prev = GENESIS;
    if (from > 0 and from <= audit.size()) for (e in audit.range((from : Int) - 1, from)) prev := e.hash;
    while (i < end) {
      let e = audit.at(i);
      if (e.seq != i or e.prevHash != prev or Canonical.sha256(body(e)) != e.hash) return ?i;
      prev := e.hash;
      i += 1;
    };
    null;
  };

  /// Newest first.
  public func page(audit : Types.Audit, offset : Nat, limit : Nat) : [Types.AuditEntry] {
    let n = audit.size();
    if (offset >= n) return [];
    let hi : Int = n - offset;
    let lo : Int = Int.max(0, hi - limit);
    audit.sliceToArray(lo, hi).reverse();
  };

};
