import { NextResponse } from 'next/server';
import { getAdminPB } from '@/lib/pocketbase';

export async function POST(req: Request) {
    try {
        const { adminId, targetUserId, newPremiumStatus } = await req.json();

        if (!adminId || !targetUserId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pb = await getAdminPB();

        // 1. Verify the requester is actually an admin
        let requester;
        try {
            requester = await pb.collection('users').getOne(adminId);
        } catch (e) {
            return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
        }

        if (!requester || !requester.is_admin) {
            return NextResponse.json({ error: 'Forbidden. Admins only.' }, { status: 403 });
        }

        // 2. Calculate the Expiration Date if upgrading
        let premiumUntil = "";
        if (newPremiumStatus) {
            const date = new Date();
            date.setDate(date.getDate() + 30); // 30 day duration
            premiumUntil = date.toISOString();
        }

        // 3. Update the target user's premium status and duration
        const updatedUser = await pb.collection('users').update(targetUserId, {
            is_premium: newPremiumStatus,
            premium_until: premiumUntil
        });

        return NextResponse.json({
            success: true,
            user: {
                id: updatedUser.id,
                is_premium: updatedUser.is_premium,
                premium_until: updatedUser.premium_until
            }
        });

    } catch (error) {
        console.error('Admin Toggle Premium Error:', error);
        return NextResponse.json({ error: 'Failed to update premium status' }, { status: 500 });
    }
}
