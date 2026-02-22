import PocketBase from 'pocketbase';

export async function getAdminPB() {
  const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
  const pb = new PocketBase(url);

  // We disable auto cancellation just like the client
  pb.autoCancellation(false);

  try {
    // Authenticate as admin to bypass normal collection rules during server-side tasks 
    // like AI generation or secure data fetching.
    await pb.admins.authWithPassword(
      process.env.PB_ADMIN_EMAIL || '',
      process.env.PB_ADMIN_PASSWORD || ''
    );
  } catch (error) {
    console.warn("Server PB Admin Auth Failed:", error);
    // Fallback for PB v0.23 supersusers (if admins fails)
    try {
      await pb.collection('_superusers').authWithPassword(
        process.env.PB_ADMIN_EMAIL || '',
        process.env.PB_ADMIN_PASSWORD || ''
      );
    } catch (e2) {
      console.error("Server PB Superusers Auth Failed. Database connection unauthenticated.");
    }
  }

  return pb;
}
