// Posting a voucher from another module (sales, later purchases and bank): the same
// checks, gapless numbering and audit entry as a manual voucher.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Audit "Audit";
import Encode "Encode";
import Ledger "Ledger";
import Types "../types";

module {
  public type Ctx = {
    chart : Types.Chart;
    config : Types.Config;
    ledger : Types.Ledger;
    files : Types.Files;
    counters : Types.Counters;
    audit : Types.Audit;
  };

  /// Checks only: run before taking any document number, so a failure leaves no gap.
  public func check(c : Ctx, v : Types.VoucherInput) : Result.Result<Types.FiscalYear, Types.Error> =
    Ledger.check(c.chart, c.config.lockDate, v, func id = c.files.attachments.containsKey(id));

  /// Posts a voucher that passed `check` in the same message.
  public func post(c : Ctx, fy : Types.FiscalYear, v : Types.VoucherInput, source : Types.SourceRef, by : Principal, now : Int) : Types.Voucher {
    let voucher = Ledger.post(c.ledger, fy, c.counters.nextVoucher, v, source, null, by, now);
    c.counters.nextVoucher += 1;
    ignore Audit.append(c.audit, now, by, "voucher.post", "voucher", ?voucher.id, Encode.voucher(voucher));
    voucher;
  };
};
