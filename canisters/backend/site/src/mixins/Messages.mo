// Admin inbox. Submitting messages is the public contact form (Phase 4).
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Auth "../lib/Auth";
import MessagesLib "../lib/Messages";
import V "../lib/Validate";
import Types "../types";

mixin (admins : Types.Admins, messages : Types.Messages) {
  public shared query ({ caller }) func listMessages(filter : Types.MessageFilter, page : Types.PageRequest) : async Result.Result<Types.MessagePage, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok(MessagesLib.page(messages, filter, page));
  };

  public shared ({ caller }) func setStatus(id : Nat, status : Types.Status) : async Result.Result<(), Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    let m = messages.get(id) ?? (return #err(#notFound));
    messages.add(id, { m with status });
    #ok(());
  };

  public shared ({ caller }) func setNote(id : Nat, note : Text) : async Result.Result<(), Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    let m = messages.get(id) ?? (return #err(#notFound));
    let clean = V.multiLine(note);
    if (clean.size() > 2000) return #err(#invalid("note"));
    messages.add(id, { m with adminNote = if (clean == "") null else ?clean });
    #ok(());
  };

  public shared ({ caller }) func deleteMessage(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    if (not messages.containsKey(id)) return #err(#notFound);
    messages.remove(id);
    #ok(());
  };

  public shared query ({ caller }) func exportMessagesCsv() : async Result.Result<Text, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok(MessagesLib.toCsv(messages));
  };
};
