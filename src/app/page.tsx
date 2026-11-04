import type { Metadata } from 'next';
import DiscoveryDashboard from '@/components/DiscoveryDashboard';
import { fetchFacilitiesWithHMOs } from '@/lib/facilities';
import { createClient } from '@/lib/supabase/server';
import type { Hmo, PatientProfile } from '@/types/database';

// The title comes from the root layout; only the description is page-specific.
export const metadata: Metadata = {
  description:
    'Find verified hospitals, clinics, pharmacies and labs in Abuja that accept your HMO plan.',
};

/**
 * Discovery home. Loads everything the dashboard needs on the server so the
 * first paint already has facilities, HMOs and the signed-in patient's
 * coverage. Calling `cookies()` through the server client makes this route
 * dynamic, which is what an authenticated dashboard needs.
 */
export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [facilities, hmosResult, profileResult] = await Promise.all([
    fetchFacilitiesWithHMOs(supabase),
    supabase
      .from('hmos')
      .select('*')
      .order('name', { ascending: true })
      .overrideTypes<Hmo[], { merge: false }>(),
    user
      ? supabase
          .from('patient_profiles')
          .select(
            'id, email, full_name, phone, has_hmo, hmo_id, hmo_plan_tier, hmo_enrollee_id, default_city, onboarding_completed, created_at, updated_at',
          )
          .eq('id', user.id)
          .maybeSingle()
          .overrideTypes<PatientProfile, { merge: false }>()
      : null,
  ]);

  if (hmosResult.error) {
    throw new Error(`Could not load HMOs: ${hmosResult.error.message}`);
  }

  // A missing or unreadable profile is not fatal: the visitor browses as a guest.
  const patientProfile = profileResult && !profileResult.error ? profileResult.data : null;

  return (
    <DiscoveryDashboard
      initialFacilities={facilities}
      hmos={hmosResult.data ?? []}
      patientProfile={patientProfile}
      initialSignedIn={user !== null}
    />
  );
}
