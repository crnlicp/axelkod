// The frontend (certified-assets) canister, called by an admin the backend has
// `authorize`d. Only the two runtime-write methods are declared.
import { Actor, HttpAgent, type Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { IDL } from "@icp-sdk/core/candid";

export type UploadAsset = { key: string; content_type: string; headers: Array<[string, string]>; content: Uint8Array };

type AssetsService = {
  upload_asset: (a: UploadAsset) => Promise<Uint8Array>;
  upload_assets: (a: UploadAsset[]) => Promise<Uint8Array>;
};

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const Upload = IDL.Record({
    key: IDL.Text,
    content_type: IDL.Text,
    headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
    content: IDL.Vec(IDL.Nat8),
  });
  return IDL.Service({
    upload_asset: IDL.Func([Upload], [IDL.Vec(IDL.Nat8)], []),
    upload_assets: IDL.Func([IDL.Vec(Upload)], [IDL.Vec(IDL.Nat8)], []),
  });
};

/** One upload_assets call is one ingress message (~2 MB in total). */
export const MAX_UPLOAD_BYTES = 1_900_000;

export async function assetsActor(identity: Identity): Promise<AssetsService> {
  const env = safeGetCanisterEnv();
  const canisterId = env?.["PUBLIC_CANISTER_ID:frontend"];
  if (!canisterId) throw new Error("ic_env cookie missing: frontend canister id unknown");
  const agent = await HttpAgent.create({ identity, rootKey: env?.IC_ROOT_KEY });
  return Actor.createActor<AssetsService>(idlFactory, { agent, canisterId });
}
