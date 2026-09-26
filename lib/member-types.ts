import type { Classmate } from "@/lib/types";

export type MemberRelation = "none" | "pending_out" | "pending_in" | "accepted";

export type MemberLink = {
  id: string;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted";
  person: Classmate;
};

export type MemberHub = {
  username: string | null;
  links: MemberLink[];
  schemaReady: boolean;
};

export type MemberSearchHit = Classmate & {
  relation: MemberRelation;
  connectionId: string | null;
};

export const MEMBERS_MIGRATION =
  "Members need a database update (supabase/migrations/0005_members.sql). Run it in the Supabase SQL editor, then refresh.";
