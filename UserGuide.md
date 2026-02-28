# NodeBB Custom Features User Guide

This guide outlines the custom features implemented to enhance the learning and communication experience for both students and instructional staff (Admins/TAs).

## 1. Anonymous Posting
Students can choose to mask their identity when asking questions or replying to topics to reduce the anxiety of participating in discussions.

* **How to use it:** When creating a post or replying, use the new dropdown menu and select **"Post as: Post anonymously"** instead of "Show my name".
* **Visibility Rules:**
  * **Students:** See the post with a `?` profile picture and the username `Anonymous`.
  * **Post Authors:** Always see their own real identity and avatar on their own anonymous posts.
  * **Admins & TAs:** Always see the real identity and avatar of the student who posted, ensuring accountability.

## 2. TA Question Resolution
Instructional staff can mark questions as resolved to help triage student needs and keep the "Comments & Feedback" section organized.

* **How it works:** * Unresolved questions automatically float to the top of the topic list for Admins/TAs.
  * When a staff member reviews a question, they can click the gray **"Unresolved"** button to toggle it to a green **"Resolved"** state.
  * Resolved questions move to the bottom of the view for staff, keeping the queue clean.
* **Visibility:** Students can see the Resolved/Unresolved status of a post but cannot click or toggle the button themselves.

## 3. Instructor Endorsements ("Supported by Instructor")
Staff can officially endorse a student's answer or a particularly good post, signaling to the rest of the class that the information is accurate.

* **How to use it (Staff Only):** * Click the 3-dot dropdown menu on any post.
  * Select **"Support Answer"**.
  * A green **"Supported by Instructor"** badge will immediately appear on the post.
  * To remove the endorsement, open the dropdown again and select **"Remove Support"**.
* **Visibility:** All users (students and staff) can see the green endorsement badge. 

## 4. Announcement View Tracking
Instructors can verify which students have read important class announcements. 

* **How it works:** * When a student opens a post in the "Announcements" category, their view is automatically logged with a timestamp. 
  * Staff views (Admins/TAs) are explicitly excluded from the tracking data.
* **How to view the data (Staff Only):** * Navigate to any main post in the Announcements category.
  * Click the eye icon (👁️) next to the reply button.
  * A dropdown will display a list of all students who have viewed the post, including their avatars, display names, and the exact time they viewed it.
