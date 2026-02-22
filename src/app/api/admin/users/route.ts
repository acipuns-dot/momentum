import { NextResponse } from 'next/server';
import { getAdminPB } from '@/lib/pocketbase';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const adminId = url.searchParams.get('adminId');

        if (!adminId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pb = await getAdminPB();

        // 1. Verify the requester is actually an admin
        let requester;
        try {
            requester = await pb.collection('users').getOne(adminId);
        } catch (e) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!requester || !requester.is_admin) {
            return NextResponse.json({ error: 'Forbidden. Admins only.' }, { status: 403 });
        }

        // 2. Fetch all users, sorted by newest first
        const users = await pb.collection('users').getFullList({
            sort: '-created',
        });

        // 3. Calculate simple revenue metrics
        const premiumCount = users.filter(u => u.is_premium).length;
        const totalUsers = users.length;
        const estimatedMRR = premiumCount * 4.90; // $4.90 per premium user

        return NextResponse.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name || 'No Name',
                is_premium: !!u.is_premium,
                premium_until: u.premium_until || null,
                created: u.created
            })),
            metrics: {
                totalUsers,
                premiumCount,
                estimatedMRR
            }
        });

    } catch (error) {
        console.error('Admin Users API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}
