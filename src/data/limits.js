/* Field limits, in ONE place so the UI and the server agree.
   maxLength in the browser is a courtesy, never a control — the Lambda
   validators clamp/reject independently (see lambda/src/user.mjs). */
export const LIMITS = {
  // Profile
  name: 60,
  bio: 400,
  location: 80,
  username: 24,

  // Publishing
  skillTitle: 80,
  skillDescription: 500,
  skillUsage: 1000,
  pocUrl: 500,

  // Reviews
  reviewText: 2000,

  // Verification
  verifyNote: 600,
  verifyUrl: 500,

  // Create-a-skill generator
  projectDesc: 160,
};
