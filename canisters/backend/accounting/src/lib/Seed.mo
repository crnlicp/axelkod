// Seed data, versioned in code (documented in docs/accounting/seed.md).
// Account names: BAS 2026 v1.1 (bas.se, "BAS_kontoplan_2026_v2.xlsx", retrieved 2026-11-25).
// VAT rates: Skatteverket "Momssatser och undantag från moms" (retrieved 2026-11-25).
// Box numbers stay null until V3 is verified in A6.
import Types "../types";

module {
  public let VERSION = "seed-2026.3";

  public let accounts : [Types.Account] = [
    { number = 1220; name = "Inventarier, verktyg och installationer"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 1229; name = "Ackumulerade avskrivningar på inventarier, verktyg och installationer"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 1460; name = "Lager av handelsvaror"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 1510; name = "Kundfordringar"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 1630; name = "Avräkning för skatter och avgifter"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 1910; name = "Kassa"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 1930; name = "Företagskonto"; kind = #asset; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2081; name = "Aktiekapital"; kind = #equity; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2091; name = "Balanserad vinst eller förlust"; kind = #equity; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2098; name = "Vinst eller förlust från föregående år"; kind = #equity; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2099; name = "Årets resultat"; kind = #equity; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2440; name = "Leverantörsskulder"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2510; name = "Skatteskulder"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2518; name = "Betald F-skatt"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2611; name = "Utgående moms på försäljning inom Sverige, 25 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2614; name = "Utgående moms omvänd betalskyldighet, 25 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2615; name = "Utgående moms import av varor, 25 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2621; name = "Utgående moms på försäljning inom Sverige, 12 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2624; name = "Utgående moms omvänd betalningsskyldighet 12 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2631; name = "Utgående moms på försäljning inom Sverige, 6 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2634; name = "Utgående moms omvänd betalningsskyldighet, 6 %"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2640; name = "Ingående moms"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2641; name = "Debiterad ingående moms"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2645; name = "Beräknad ingående moms på förvärv från utlandet"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2647; name = "Ingående moms omvänd betalningsskyldighet varor och tjänster i Sverige"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2650; name = "Redovisningskonto för moms"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2710; name = "Personalskatt"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2731; name = "Avräkning lagstadgade sociala avgifter"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2820; name = "Kortfristiga skulder till anställda"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2890; name = "Övriga kortfristiga skulder"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2920; name = "Upplupna semesterlöner"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 2941; name = "Beräknade upplupna lagstadgade sociala avgifter"; kind = #liability; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 3001; name = "Försäljning inom Sverige, 25 % moms"; kind = #revenue; vatCode = ?"U25"; sruCode = null; active = true; bas = true },
    { number = 3002; name = "Försäljning inom Sverige, 12 % moms"; kind = #revenue; vatCode = ?"U12"; sruCode = null; active = true; bas = true },
    { number = 3003; name = "Försäljning inom Sverige, 6 % moms"; kind = #revenue; vatCode = ?"U6"; sruCode = null; active = true; bas = true },
    { number = 3004; name = "Försäljning inom Sverige, momsfri"; kind = #revenue; vatCode = ?"MF"; sruCode = null; active = true; bas = true },
    { number = 3105; name = "Försäljning varor till land utanför EU"; kind = #revenue; vatCode = ?"EXPV"; sruCode = null; active = true; bas = true },
    { number = 3108; name = "Försäljning varor till annat EU-land, momsfri"; kind = #revenue; vatCode = ?"EUVA"; sruCode = null; active = true; bas = true },
    { number = 3305; name = "Försäljning tjänster till land utanför EU"; kind = #revenue; vatCode = ?"EXPT"; sruCode = null; active = true; bas = true },
    { number = 3308; name = "Försäljning tjänster till annat EU-land"; kind = #revenue; vatCode = ?"EUTJ"; sruCode = null; active = true; bas = true },
    { number = 3740; name = "Öres- och kronutjämning"; kind = #revenue; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 3960; name = "Valutakursvinster på fordringar och skulder av rörelsekaraktär"; kind = #revenue; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 3990; name = "Övriga ersättningar, bidrag och intäkter"; kind = #revenue; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4010; name = "Inköp av handelsvaror i Sverige"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4415; name = "Inköp av råvaror och material i Sverige, omvänd betalningsskyldighet, 25 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4416; name = "Inköp av råvaror och material i Sverige, omvänd betalningsskyldighet, 12 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4417; name = "Inköp av råvaror och material i Sverige, omvänd betalningsskyldighet, 6 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4425; name = "Inköp av tjänster i Sverige, omvänd betalningsskyldighet, 25 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4426; name = "Inköp av tjänster i Sverige, omvänd betalningsskyldighet, 12 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4427; name = "Inköp av tjänster i Sverige, omvänd betalningsskyldighet, 6 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4515; name = "Inköp av råvaror och material från annat EU-land, 25 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4516; name = "Inköp av råvaror och material från annat EU-land, 12 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4517; name = "Inköp av råvaror och material från annat EU-land, 6 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4531; name = "Inköp av tjänster från ett land utanför EU, 25 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4532; name = "Inköp av tjänster från ett land utanför EU, 12 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4533; name = "Inköp av tjänster från ett land utanför EU, 6 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4535; name = "Inköp av tjänster från annat EU-land, 25 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4536; name = "Inköp av tjänster från annat EU-land, 12 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4537; name = "Inköp av tjänster från annat EU-land, 6 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 4545; name = "Import av råvaror och material, 25 % moms"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 5410; name = "Förbrukningsinventarier"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 6110; name = "Kontorsmateriel"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 6212; name = "Mobiltelefon"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 6230; name = "Datakommunikation"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 6250; name = "Porto"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 6540; name = "IT-tjänster"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 6570; name = "Bankkostnader"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7010; name = "Löner till kollektivanställda"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7210; name = "Löner till tjänstemän"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7290; name = "Förändring av semesterlöneskuld"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7510; name = "Arbetsgivaravgifter 31,42 %"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7533; name = "Särskild löneskatt för pensionskostnader"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7690; name = "Övriga personalkostnader"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7832; name = "Avskrivningar på inventarier, verktyg och installationer"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 7960; name = "Valutakursförluster på fordringar och skulder av rörelsekaraktär"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8310; name = "Ränteintäkter från omsättningstillgångar"; kind = #revenue; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8313; name = "Ränteintäkter från kortfristiga fordringar"; kind = #revenue; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8314; name = "Skattefria ränteintäkter"; kind = #revenue; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8410; name = "Räntekostnader för långfristiga skulder"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8423; name = "Räntekostnader för skatter och avgifter"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8811; name = "Avsättning till periodiseringsfond"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8910; name = "Skatt som belastar årets resultat"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
    { number = 8999; name = "Årets resultat"; kind = #expense; vatCode = null; sruCode = null; active = true; bas = true },
  ];

  func code(code : Text, name : Text, rateBp : Nat, kind : Types.VatKind, account : ?Nat) : Types.VatCode {
    { code; name; rateBp; kind; account; boxBase = null; boxVat = null; active = true };
  };

  public func vatCodes() : [Types.VatCode] = [
    code("U25", "Utgående moms 25 %", 2500, #outputDomestic, ?2611),
    code("U12", "Utgående moms 12 %", 1200, #outputDomestic, ?2621),
    code("U6", "Utgående moms 6 %", 600, #outputDomestic, ?2631),
    code("I", "Ingående moms", 0, #inputDomestic, ?2641),
    code("OBP", "Omvänd betalningsskyldighet, inköp 25 %", 2500, #reverseChargePurchase, ?2614),
    code("EUVA", "Varuförsäljning till annat EU-land", 0, #euGoodsSale, null),
    code("EUTJ", "Tjänsteförsäljning till annat EU-land", 0, #euServiceSale, null),
    code("EXPV", "Export av varor", 0, #exportGoods, null),
    code("EXPT", "Tjänster till land utanför EU", 0, #exportServices, null),
    code("MF", "Momsfri försäljning", 0, #exempt, null),
  ];

  public let series : [Types.Series] = [
    { code = "A"; name = "Manuella verifikationer" },
    { code = "F"; name = "Kundfakturor" },
    { code = "L"; name = "Leverantörsfakturor" },
    { code = "B"; name = "Bank" },
    { code = "P"; name = "Lön" },
    { code = "M"; name = "Moms" },
    { code = "X"; name = "Bokslut" },
    { code = "C"; name = "Rättelser" },
  ];

  /// Series a correction voucher is posted in.
  public let CORRECTION_SERIES = "C";
};
