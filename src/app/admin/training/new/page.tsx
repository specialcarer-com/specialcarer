import { requireAdmin } from "@/lib/admin/auth";
import CourseForm, {
  DEFAULT_VALUES,
  EMPTY_QUESTION,
} from "../CourseForm";

export const dynamic = "force-dynamic";

export default async function NewTrainingCoursePage() {
  await requireAdmin();
  return (
    <CourseForm
      mode="create"
      initialCourse={DEFAULT_VALUES}
      initialQuestions={[{ ...EMPTY_QUESTION, options: ["", "", "", ""] }]}
      initialPublishedAt={null}
    />
  );
}
