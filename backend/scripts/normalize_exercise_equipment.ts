import dotenv from 'dotenv';
import PocketBase from 'pocketbase';

dotenv.config({ path: '../frontend/.env.local' });

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.error('Missing PocketBase admin credentials.');
    process.exit(1);
}

const RAW_EQUIPMENT_MAP: Record<string, string[]> = {
    'body weight': ['none'],
    bodyweight: ['none'],
    dumbbell: ['dumbbell'],
    'dumbbell (used as handles for deeper range)': ['dumbbell'],
    'dumbbell, exercise ball': ['dumbbell', 'exercise_ball'],
    barbell: ['barbell'],
    'ez barbell': ['ez_barbell'],
    'ez barbell, exercise ball': ['ez_barbell', 'exercise_ball'],
    'olympic barbell': ['barbell'],
    'trap bar': ['trap_bar'],
    cable: ['cable'],
    'leverage machine': ['machine'],
    'smith machine': ['smith_machine'],
    'sled machine': ['sled'],
    kettlebell: ['kettlebell'],
    band: ['band'],
    'resistance band': ['band'],
    'body weight (with resistance band)': ['band'],
    rope: ['jump_rope'],
    'jump rope': ['jump_rope'],
    'stability ball': ['stability_ball'],
    'exercise ball': ['exercise_ball'],
    'medicine ball': ['medicine_ball'],
    'bosu ball': ['bosu_ball'],
    assisted: ['assisted'],
    'assisted (towel)': ['assisted'],
    roller: ['roller'],
    'wheel roller': ['ab_wheel'],
    hammer: ['hammer'],
    'stationary bike': ['stationary_bike'],
    'upper body ergometer': ['ergometer'],
    'elliptical machine': ['elliptical'],
    'stepmill machine': ['stepmill'],
    weighted: ['weighted'],
};

const slugEquipment = (value: string): string => value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const normalizeEquipment = (rawValue: unknown): string[] => {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return ['none'];
    const raw = rawValue.toLowerCase().trim();

    if (RAW_EQUIPMENT_MAP[raw]) return unique(RAW_EQUIPMENT_MAP[raw]);

    const parts = raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    const mapped = parts.flatMap((part) => {
        if (RAW_EQUIPMENT_MAP[part]) return RAW_EQUIPMENT_MAP[part];
        if (part.includes('body weight')) return ['none'];
        if (part.includes('resistance band')) return ['band'];
        if (part.includes('jump rope')) return ['jump_rope'];
        if (part.includes('treadmill') || part.includes('threadmill')) return ['treadmill'];
        return [slugEquipment(part)];
    });

    const result = unique(mapped);
    return result.length ? result : ['none'];
};

const primaryEquipmentType = (equipmentList: string[]): string => {
    const first = equipmentList[0] || 'none';
    if (!equipmentList.length) return 'none';
    if (equipmentList.length === 1) return first;
    return equipmentList.find((eq) => eq !== 'none') || first;
};

async function run() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);

    const records = await pb.collection('exercise_cache_db').getFullList({ fields: 'id,data,name' });

    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of records as any[]) {
        scanned += 1;
        const data = record?.data;

        if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data?.name !== 'string') {
            skipped += 1;
            continue;
        }

        const equipmentList = normalizeEquipment(data.equipment);
        const equipmentType = primaryEquipmentType(equipmentList);
        const currentList = Array.isArray(data.equipment_list) ? data.equipment_list : [];
        const currentType = typeof data.equipment_type === 'string' ? data.equipment_type : '';
        const nextListJson = JSON.stringify(equipmentList);
        const currentListJson = JSON.stringify(currentList);

        if (currentType === equipmentType && currentListJson === nextListJson) {
            continue;
        }

        await pb.collection('exercise_cache_db').update(record.id, {
            data: {
                ...data,
                equipment_type: equipmentType,
                equipment_list: equipmentList,
            },
        });
        updated += 1;
    }

    console.log(`Scanned: ${scanned}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped non-exercise cache records: ${skipped}`);
}

run().catch((err) => {
    console.error('Normalization script failed:', err);
    process.exit(1);
});
