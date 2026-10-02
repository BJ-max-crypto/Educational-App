import { lookupClassLink } from "@/app/(app)/member-actions";
import { ClassJoin } from "@/components/class-join";

export default async function JoinClassPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const result = await lookupClassLink(courseId);
  return <ClassJoin courseId={courseId} result={result} />;
}
