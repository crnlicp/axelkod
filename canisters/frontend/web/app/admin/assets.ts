// The frontend (certified-assets) canister, called by an admin the backend has
// `authorize`d. Only the two runtime-write methods are declared.
import { Actor, HttpAgent, type Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { IDL } from "@icp-sdk/core/candid";

export type UploadAsset = { key: string; content_type: string; headers: Array<[string, string]>; content: Uint8Array };

type AssetDetails = { key: string; content_type: string };
type AssetsService = {
  upload_asset: (a: UploadAsset) => Promise<Uint8Array>;
  upload_assets: (a: UploadAsset[]) => Promise<Uint8Array>;
  get_asset_details: (startAfter: [] | [string]) => Promise<AssetDetails[]>;
};

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const Upload = IDL.Record({
    key: IDL.Text,
    content_type: IDL.Text,
    headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
    content: IDL.Vec(IDL.Nat8),
  });
  // Only the fields we read; Candid record subtyping ignores the rest.
  const Details = IDL.Record({ key: IDL.Text, content_type: IDL.Text });
  return IDL.Service({
    upload_asset: IDL.Func([Upload], [IDL.Vec(IDL.Nat8)], []),
    upload_assets: IDL.Func([IDL.Vec(Upload)], [IDL.Vec(IDL.Nat8)], []),
    get_asset_details: IDL.Func([IDL.Opt(IDL.Text)], [IDL.Vec(Details)], ["query"]),
  });
};

/** One upload_assets call is one ingress message (~2 MB in total). */
export const MAX_UPLOAD_BYTES = 1_900_000;

/** Every asset key on the frontend canister (paged). */
export async function listAssetKeys(assets: Awaited<ReturnType<typeof assetsActor>>): Promise<string[]> {
  const keys: string[] = [];
  let after: [] | [string] = [];
  for (;;) {
    const page = await assets.get_asset_details(after);
    if (page.length === 0) return keys;
    keys.push(...page.map((a) => a.key));
    after = [page[page.length - 1].key];
  }
}

export async function assetsActor(identity: Identity): Promise<AssetsService> {
  const env = safeGetCanisterEnv();
  const canisterId = env?.["PUBLIC_CANISTER_ID:web"];
  if (!canisterId) throw new Error("ic_env cookie missing: frontend canister id unknown");
  const agent = await HttpAgent.create({ identity, rootKey: env?.IC_ROOT_KEY });
  return Actor.createActor<AssetsService>(idlFactory, { agent, canisterId });
}
