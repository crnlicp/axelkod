// Initial state. Pending (never deployed to mainnet). Self-contained.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";

module {
  type Role = { #owner; #bookkeeper; #payroll; #auditor };
  type Upload = {
    id : Nat; owner : Principal; mime : Text; size : Nat; chunkCount : Nat; cipherSha256 : Blob;
    createdAt : Int; chunks : Map.Map<Nat, Blob>;
  };
  type File = { id : Nat; mime : Text; size : Nat; chunkCount : Nat; cipherSha256 : Blob; uploadedBy : Principal; uploadedAt : Int };

  type OldActor = {};
  type NewActor = {
    roles : Map.Map<Principal, Role>;
    store : {
      uploads : Map.Map<Nat, Upload>;
      files : Map.Map<Nat, File>;
      chunks : Map.Map<Nat, Blob>;
      var nextUpload : Nat;
      var nextFile : Nat;
    };
  };

  public func migration(_ : OldActor) : NewActor {
    {
      roles = Map.empty();
      store = { uploads = Map.empty(); files = Map.empty(); chunks = Map.empty(); var nextUpload = 1; var nextFile = 1 };
    };
  };
};
