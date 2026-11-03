import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { LegalContact, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | MedNet',
  description:
    'What personal data MedNet collects, why, how long it is kept, and how to update or delete it, in line with the Nigeria Data Protection Act 2023.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="This policy explains what personal data MedNet collects when you use the service, why we collect it, and the choices you have. MedNet processes personal data in line with the Nigeria Data Protection Act 2023 (NDPA) and acts as the data controller for the data described here."
    >
      <LegalSection title="1. What we collect">
        <p>We collect only what the service needs to work:</p>
        <ul>
          <li>
            <strong>Account:</strong> your email address and a password. Passwords are handled by
            our authentication provider and stored only as a secure hash. MedNet never sees your
            password in plain text.
          </li>
          <li>
            <strong>Profile (optional):</strong> your full name and phone number, if you enter
            them when you create an account.
          </li>
          <li>
            <strong>Coverage (optional):</strong> the HMO provider and plan tier you select, and
            your default city. These are used to show which facilities accept your plan.
          </li>
          <li>
            <strong>Location (optional, in-session only):</strong> if you tap “Locate me”, your
            browser asks your permission and shares your current position with the MedNet page.
            The position is used in your browser to calculate distances to Abuja facilities and
            sort them. It is not sent to or stored on MedNet servers, and it is discarded when you
            close or reload the page.
          </li>
          <li>
            <strong>On this device:</strong> your recent searches and recently viewed facilities
            are kept in your browser’s local storage so the panel can show them again. They stay on
            your device and are not sent to MedNet. You can remove them with the “Clear” button in
            the panel.
          </li>
          <li>
            <strong>Technical:</strong> a session cookie that keeps you signed in, and the standard
            request logs kept by our hosting providers (such as IP address, browser type and time
            of request) for security and reliability.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. What we do not collect">
        <p>
          MedNet does not collect or store medical records, diagnoses, prescriptions, test results,
          appointment details, HMO enrollee or member ID numbers, or payment card details. Please do
          not enter medical information in any MedNet field. We also do not build a history of your
          locations.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use your data">
        <ul>
          <li>to sign you in and keep your account secure;</li>
          <li>to show which facilities accept your HMO plan and to remember your default city;</li>
          <li>to sort facilities by distance when you choose to share your location;</li>
          <li>to respond when you contact us;</li>
          <li>to protect MedNet against misuse and to fix problems.</li>
        </ul>
        <p>We do not use your data for advertising and we do not sell it.</p>
      </LegalSection>

      <LegalSection title="4. Legal basis under the NDPA">
        <p>
          We rely on your consent for optional data such as your HMO plan and your location, on the
          need to provide the service you signed up for (your account), and on our legitimate
          interest in keeping MedNet secure. You can withdraw consent at any time by removing your
          plan details on the <Link href="/onboarding">onboarding page</Link> or by declining the
          browser’s location prompt.
        </p>
      </LegalSection>

      <LegalSection title="5. Who we share data with">
        <ul>
          <li>
            <strong>Supabase</strong> hosts our database and authentication service. Your account
            and profile data are stored there. The servers may be located outside Nigeria; where
            that is the case we rely on the safeguards the NDPA requires for cross-border transfers.
          </li>
          <li>
            <strong>OpenStreetMap</strong> serves the map tiles. When the map loads, your browser
            requests tiles directly from OpenStreetMap servers, which see your IP address.
          </li>
          <li>
            <strong>Google Maps</strong> opens only when you tap “Directions”. Google’s privacy
            policy applies from that point.
          </li>
        </ul>
        <p>
          We do not share your name, contact details or plan information with hospitals, clinics,
          pharmacies, laboratories or HMOs.
        </p>
      </LegalSection>

      <LegalSection title="6. How long we keep data">
        <p>
          Account and profile data are kept for as long as your account exists. Data stored in your
          browser stays until you clear it. When you ask us to delete your account, we remove your
          profile and sign-in record within 30 days of confirming the request.
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>Under the NDPA you have the right to:</p>
        <ul>
          <li>access the personal data we hold about you;</li>
          <li>correct data that is inaccurate or incomplete;</li>
          <li>ask us to delete your data;</li>
          <li>restrict or object to how we process your data;</li>
          <li>receive a copy of your data in a portable format;</li>
          <li>withdraw consent where processing is based on consent.</li>
        </ul>
        <p>
          You can also lodge a complaint with the Nigeria Data Protection Commission (NDPC) if you
          believe we have not handled your data properly.
        </p>
      </LegalSection>

      <LegalSection title="8. Updating or deleting your data">
        <ul>
          <li>
            <strong>HMO plan and city:</strong> change or remove them at any time on the{' '}
            <Link href="/onboarding">onboarding page</Link>.
          </li>
          <li>
            <strong>Name, phone or email:</strong> contact us using the details below and we will
            update them.
          </li>
          <li>
            <strong>Account deletion:</strong> contact us from the email address on the account.
            We will confirm the request and delete your data within 30 days.
          </li>
          <li>
            <strong>Recent searches and viewed facilities:</strong> use the “Clear” button in the
            panel, or clear your browser’s site data.
          </li>
          <li>
            <strong>Location:</strong> withdraw access in your browser’s site permissions.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>
          MedNet is served over HTTPS, passwords are hashed, and database rules restrict each
          profile to the signed-in account that owns it. No system is completely secure, so please
          keep your password private and tell us if you suspect any misuse of your account.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>
          MedNet is intended for adults. If you are under 18, use MedNet with the consent of a
          parent or guardian.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>
          We may update this policy. The date at the top shows when it last changed. If a change
          materially affects how we use your data, we will say so on this page.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <LegalContact />
        <p>
          See also our <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
