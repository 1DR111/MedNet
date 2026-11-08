import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { LegalContact, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms & Conditions | MedNet',
  description:
    'The terms and conditions that apply when you use MedNet, an independent directory of hospitals, clinics, pharmacies, laboratories, dental and eye clinics and specialist centres in Abuja, Nigeria.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      summary="These terms and conditions apply when you use MedNet, whether as a guest or with an account. Please read them. By using MedNet you agree to them."
    >
      <LegalSection title="1. What MedNet is">
        <p>
          MedNet is an independent online directory of hospitals, clinics, pharmacies,
          laboratories, dental and eye clinics and specialist centres in Abuja, Federal Capital
          Territory, Nigeria. It helps you find a facility,
          see which HMO plans the facility has told us it accepts, check its listed hours and get
          directions.
        </p>
        <p>
          MedNet is not a hospital, clinic, pharmacy, laboratory, medical provider, health
          maintenance organisation (HMO) or insurer. We do not provide medical advice, diagnosis or
          treatment, and using MedNet does not create a doctor-patient relationship. The facilities
          listed on MedNet are independent organisations that we do not own, operate or control.
        </p>
      </LegalSection>

      <LegalSection title="2. Medical emergencies">
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          MedNet is not an emergency service. If you or someone near you needs urgent medical
          help, call 112, the national emergency number in Nigeria, or go to the nearest hospital
          with an emergency department. Do not rely on MedNet listings, hours or the Emergency
          filter in an emergency.
        </p>
      </LegalSection>

      <LegalSection title="3. Facility information">
        <p>
          Listings include details such as addresses, phone numbers, operating hours, specialties,
          whether a facility reports emergency services, and the HMO plans a facility accepts. This
          information comes from the facilities themselves, from public sources and from checks by
          the MedNet team. It can change without notice, and we cannot guarantee that it is
          complete, current or accurate at the moment you read it.
        </p>
        <p>
          A “Verified” badge means the MedNet team confirmed the listing details with the facility
          at a point in time. It is not a rating of clinical quality and not a recommendation.
        </p>
        <p>
          Operating hours and the “Open 24/7” badge are there to help you plan a visit. Confirm by
          phone before you travel, especially at night, on weekends and on public holidays.
        </p>
      </LegalSection>

      <LegalSection title="4. HMO coverage">
        <p>
          Whether a facility will treat you under your HMO plan depends on your HMO’s current
          provider network, your plan tier, your enrolment status and the service you need. MedNet
          shows the plans a facility has told us it accepts, as routing information only. Always
          confirm with the facility’s HMO desk and with your HMO before you receive treatment.
          MedNet is not responsible for charges that result from a facility declining your plan or
          from a service not being covered.
        </p>
      </LegalSection>

      <LegalSection title="5. Your account">
        <ul>
          <li>Give accurate information when you create an account and keep it up to date.</li>
          <li>Keep your password private. You are responsible for activity under your account.</li>
          <li>
            You must be at least 18 years old, or use MedNet with the consent of a parent or
            guardian.
          </li>
          <li>
            Your HMO plan details are optional and are used only to match you with facilities.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>
            copy, scrape or bulk-download facility data, or access MedNet with automated tools
            without our written permission;
          </li>
          <li>submit false, misleading or defamatory information about any facility, HMO or person;</li>
          <li>
            interfere with the security or operation of MedNet, or attempt to access other users’
            data;
          </li>
          <li>use MedNet for any unlawful purpose or in breach of any law that applies in Nigeria.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Third-party services">
        <p>
          MedNet links to services we do not control. “Directions” opens Google Maps, “Call” uses
          your phone’s dialler, and some listings link to a facility’s own website. Map tiles are
          provided by OpenStreetMap contributors. Those services have their own terms and privacy
          policies.
        </p>
      </LegalSection>

      <LegalSection title="8. Availability and changes">
        <p>
          MedNet is an early-stage service. We may add, change or remove features, listings or the
          service itself at any time, and we do not promise that MedNet will always be available or
          free of errors.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          To the fullest extent permitted by the laws of Nigeria, MedNet is not liable for any loss,
          injury, cost or damage arising from your use of MedNet, from inaccurate or outdated
          listing information, from the acts or omissions of any facility or HMO, or from your
          reliance on information shown on MedNet. Nothing in these terms excludes liability that
          cannot be excluded under Nigerian law.
        </p>
      </LegalSection>

      <LegalSection title="10. Governing law">
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute is
          subject to the jurisdiction of the courts in the Federal Capital Territory, Abuja.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to these terms">
        <p>
          We may update these terms. The date at the top shows when they last changed. If you keep
          using MedNet after an update, the updated terms apply.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact and privacy">
        <LegalContact />
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains what personal data we collect
          and how we handle it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
