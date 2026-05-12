/**
 * Preview the grace-period compliance email locally without sending.
 * Writes the HTML to /home/user/workspace/grace_blast_preview.html.
 */
import { writeFileSync } from "node:fs";
import {
  _renderGracePeriodBlastHtml,
  _renderGracePeriodBlastText,
} from "../src/lib/email/grace-period-blast";

const html = _renderGracePeriodBlastHtml({
  fullName: "Priya Sharma",
  email: "test.carer.uk@specialcarer.com",
  missingCourses: ["food-hygiene", "medication-administration"],
  graceEndsAt: "2026-06-11T01:12:06.832Z",
  worksWithAdults: true,
  worksWithChildren: false,
});

writeFileSync("/home/user/workspace/grace_blast_preview.html", html);
console.log("HTML written to /home/user/workspace/grace_blast_preview.html");
console.log("");
console.log("--- TEXT VERSION ---");
console.log(
  _renderGracePeriodBlastText({
    fullName: "Priya Sharma",
    email: "test.carer.uk@specialcarer.com",
    missingCourses: ["food-hygiene", "medication-administration"],
    graceEndsAt: "2026-06-11T01:12:06.832Z",
    worksWithAdults: true,
    worksWithChildren: false,
  }),
);
