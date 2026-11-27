/** The screen gallery exists for checking the interface without a session. It is switched off on the production deployment. */
export const galleryEnabled = () => process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
