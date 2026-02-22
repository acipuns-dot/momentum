/**
 * Calculate personalised calorie and macro targets from the user's profile.
 * Uses weight-based TDEE estimation (no height/age needed).
 *
 * Activity multiplier (kcal/kg/day):
 *   sedentary        → 28
 *   lightly_active   → 32
 *   moderately_active→ 35
 *   very_active      → 40
 *
 * Goal adjustment:
 *   losing (current > goal + 2kg) → −20% deficit
 *   gaining (goal > current + 2kg)→ +10% surplus
 *   otherwise                     → maintenance
 *
 * Macros:
 *   Protein → 2 g/kg of body weight
 *   Fat     → 30% of target kcal (÷ 9)
 *   Carbs   → remaining kcal (÷ 4)
 */

type Profile = {
    current_weight?: number;
    goal_weight?: number;
    activity_level?: string;
};

const ACTIVITY_FACTOR: Record<string, number> = {
    sedentary: 28,
    lightly_active: 32,
    moderately_active: 35,
    very_active: 40,
};

export function calcNutritionTargets(profile: Profile | null | undefined) {
    const weight = profile?.current_weight || 70;
    const goalWeight = profile?.goal_weight || weight;
    const activityKey = profile?.activity_level?.toLowerCase() || 'moderately_active';

    const factor = ACTIVITY_FACTOR[activityKey] ?? 33;
    let tdee = weight * factor;

    const diff = weight - goalWeight;
    if (diff > 2) {
        // Losing weight → 20% deficit
        tdee *= 0.80;
    } else if (diff < -2) {
        // Gaining → 10% surplus
        tdee *= 1.10;
    }

    const targetKcal = Math.round(tdee / 50) * 50; // round to nearest 50
    const targetProtein = Math.round(weight * 2);
    const targetFat = Math.round((targetKcal * 0.30) / 9);
    const targetCarbs = Math.round((targetKcal - targetProtein * 4 - targetFat * 9) / 4);

    return { targetKcal, targetProtein, targetCarbs, targetFat };
}
