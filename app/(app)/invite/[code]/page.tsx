import { InviteConfirm } from "@/components/invite-confirm";
import { lookupInvite } from "@/app/(app)/member-actions";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await lookupInvite(code);
  return <InviteConfirm result={result} />;
}
