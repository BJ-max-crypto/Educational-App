import { CoursePortalView } from "@/components/course-portal-view";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <CoursePortalView courseId={courseId} />;
}
