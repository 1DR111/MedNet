import type { HmoPlanDetail } from '@/types/database';

/**
 * Built-in plan catalog for the six supported HMOs, keyed by the `hmos.code`
 * column. `getPlansForHmo()` in `facilities.ts` uses it only when a row's
 * `plan_details` is empty, so the database stays the source of truth.
 *
 * Mirrors the `plan_details` loaded into the `hmos` table on 8 November 2026
 * (generated from that data, not typed by hand). Figures are the HMOs'
 * published plan schedules at that date; update the table, not this file.
 */
export const FALLBACK_PLAN_DETAILS: Record<string, readonly HmoPlanDetail[]> = {
  // AVON HMO
  AVON: [
    {
      name: 'Life Starter',
      category: 'Retail',
      summary:
        'Essential primary care plan for everyday outpatient consultations, malaria care, and basic lab tests.',
      benefits: [
        'GP consultations',
        'Malaria & basic lab investigations',
        'Prescribed formulary drugs',
        'Emergency stabilization',
      ],
      restrictions:
        'Excludes chronic conditions (hypertension/diabetes), antenatal/maternity, optical, dental, and Tier-1 specialist hospitals.',
    },
    {
      name: 'Couples Plan',
      category: 'Retail',
      summary:
        'Joint health plan designed for couples covering consultations, diagnostics, maternity planning, and inpatient care.',
      benefits: [
        'GP & specialist consultations',
        'Family planning & fertility check',
        'Antenatal & delivery cover',
        'General/Semi-private ward',
      ],
      restrictions:
        '18-month waiting period applies to maternity delivery benefits; pre-authorization required for secondary care.',
    },
    {
      name: 'Life Plus',
      category: 'Retail',
      summary:
        'Standard retail plan with 4 specialist visits/yr, general ward admission (30 days), maternity (N200k), and surgery (N250k).',
      benefits: [
        'GP + 4 specialist consultations/yr',
        'General ward (up to 30 days)',
        'Surgeries up to N250,000',
        'Maternity up to N200,000',
        'Dental (N10,000) & Optical (N7,500)',
        '5 physiotherapy sessions',
      ],
      restrictions:
        '6-month wait for dental, 12-month wait for surgery/optical, 18-month wait for maternity.',
    },
    {
      name: 'Premium Life',
      category: 'Retail',
      summary:
        'Enhanced plan with 6 specialist visits/yr, semi-private ward, surgeries up to N350k, maternity up to N300k, and chronic disease cover.',
      benefits: [
        'GP + 6 specialist consultations/yr',
        'Semi-private ward (30 days)',
        'Surgeries up to N350,000',
        'Maternity up to N300,000',
        'Dental (N25,000) & Optical (N10,000)',
        '10 physiotherapy sessions & 2 acute dialysis sessions',
      ],
      restrictions:
        '12-month wait for surgery/optical, 18-month wait for maternity, 24-month wait for chronic conditions.',
    },
    {
      name: 'The Boss Life',
      category: 'Retail / Executive',
      summary:
        'Flagship retail plan with private single room (unlimited days), 10 specialist visits/yr, surgeries up to N750k, and full hospital network.',
      benefits: [
        'Private single room (unlimited days)',
        'GP + 10 specialist consultations/yr',
        'Surgeries up to N750,000',
        'Maternity up to N450,000',
        'Dental up to N60,000',
        'ICU & NICU cover (up to 7 days)',
      ],
      restrictions:
        'Excludes IVF/ICSI fertility treatments; pre-authorization required for admissions and surgeries.',
    },
    {
      name: 'Corporate Prestige',
      category: 'Corporate',
      summary:
        'Top corporate tier with full access to Tier-1 Abuja specialist hospitals, executive health checks, and custom corporate limits.',
      benefits: [
        'Full Abuja network including Cedarcrest, Nisa Premier & Diff Medical',
        'Private suite admission',
        'Chronic condition management',
        'Annual executive screening',
      ],
      restrictions:
        'Subject to corporate policy schedule.',
    },
  ],
  // AXA Mansard Health
  AXA: [
    {
      name: 'EasyCare',
      category: 'Retail',
      summary:
        'Entry-level outpatient and primary healthcare plan for individuals.',
      benefits: [
        'GP consultations',
        'Basic laboratory tests',
        'Prescribed acute medications',
        'Primary eye & ENT care',
      ],
      restrictions:
        'Primary care clinics only; excludes maternity, surgeries, and tertiary specialist hospitals.',
    },
    {
      name: 'Bronze',
      category: 'Retail & Corporate',
      summary:
        'Provides N150k outpatient cover and N350k inpatient cover in a general ward with surgery and maternity up to N250k.',
      benefits: [
        'N150,000 outpatient / N350,000 inpatient (General Ward)',
        'GP & specialist consultations',
        'Surgeries up to N250,000',
        'Maternity up to N250,000',
        'Dental (N10,000) & Optical (N7,500)',
      ],
      restrictions:
        '12-month moratorium on retail maternity; excludes Tier-1 private specialist hospitals.',
    },
    {
      name: 'Silver',
      category: 'Retail & Corporate',
      summary:
        'Raises outpatient cover to N250k and inpatient cover to N500k with private ward access and N300k surgery/maternity limits.',
      benefits: [
        'N250,000 outpatient / N500,000 inpatient (Private Ward)',
        'Surgeries up to N300,000',
        'Maternity up to N300,000',
        'Dental (N10,000) & Optical (N10,000)',
        'Fertility investigation up to N25,000',
      ],
      restrictions:
        'Specialist consultations and hospital admissions require AXA pre-authorization.',
    },
    {
      name: 'Gold',
      category: 'Retail & Corporate',
      summary:
        'Provides N300k outpatient and N1,000,000 inpatient cover in a private ward, N500k surgeries/maternity, and N60k dental.',
      benefits: [
        'N300,000 outpatient / N1,000,000 inpatient (Private Ward)',
        'Surgeries & Maternity up to N500,000',
        'Dental up to N60,000 & Optical up to N15,000',
        'Fertility HSG & hormonal assay up to N50,000',
        'Annual health screening (X-Ray, LFT, KFT, PSA/Pap smear)',
      ],
      restrictions:
        'Pre-authorization required for surgeries, maternity delivery, and advanced diagnostics.',
    },
    {
      name: 'Platinum',
      category: 'Retail & Corporate',
      summary:
        'Provides N500k outpatient and N2,000,000 inpatient cover with access to top Abuja specialist hospitals and CT/MRI scans.',
      benefits: [
        'N500,000 outpatient / N2,000,000 inpatient (Private Ward)',
        'Surgeries up to N1,000,000 & Maternity up to N750,000',
        'Dental (N80,000) & Optical (N25,000)',
        'CT Scan, MRI & annual mammogram/ECG',
        'Full Tier-1 Abuja hospital access',
      ],
      restrictions:
        'Pre-authorization required for inpatient admissions and CT/MRI imaging.',
    },
    {
      name: 'Platinum Plus',
      category: 'Executive',
      summary:
        'Extends outpatient cover to N1,000,000 and inpatient cover to N3,000,000 with ICU, private ward, and N150k dental.',
      benefits: [
        'N1,000,000 outpatient / N3,000,000 inpatient (Private Ward & ICU)',
        'Surgeries up to N1,000,000 & Maternity up to N750,000',
        'Dental up to N150,000 & Optical up to N40,000',
        'Advanced CT/MRI & fertility hysteroscopy up to N100,000',
      ],
      restrictions:
        'Pre-authorization required for elective hospital admissions.',
    },
    {
      name: 'Rhodium',
      category: 'Executive',
      summary:
        'AXA Mansard flagship individual and executive tier with unrestricted Abuja specialist network access.',
      benefits: [
        'N1,000,000 outpatient / N3,000,000 inpatient',
        'Unrestricted Tier-1 Abuja hospital access',
        'Comprehensive surgical, maternity, dental & optical cover',
      ],
      restrictions:
        'Subject to policy terms and underwriting.',
    },
  ],
  // Hygeia HMO
  HYGEIA: [
    {
      name: 'HyEase',
      category: 'Retail',
      summary:
        'Budget primary healthcare plan (also known as HyEssential) for basic outpatient consultations and malaria care.',
      benefits: [
        'Primary care GP consultations',
        'Malaria & basic laboratory tests',
        'Prescribed basic medications',
      ],
      restrictions:
        'Restricted to Category D primary care clinics; excludes maternity, optical, dental, and surgeries.',
    },
    {
      name: 'HyBasic',
      category: 'Retail',
      summary:
        'Foundational individual/family plan covering Category C & D providers, outpatient care, and general ward admission.',
      benefits: [
        'Category C & D hospitals & clinics',
        'GP & referred specialist visits',
        'General ward admission',
        'Basic diagnostics & minor procedures',
      ],
      restrictions:
        'Excludes Category A & B specialist hospitals and retail maternity.',
    },
    {
      name: 'HyPrime',
      category: 'Retail & Corporate',
      summary:
        'Mid-to-high tier plan granting access to Category B, C & D Abuja hospitals (including Garki Hospital) with surgical and optical/dental cover.',
      benefits: [
        'Category B, C & D Abuja hospitals',
        'Semi-private/Private ward admission',
        'Minor & intermediate surgeries',
        'Dental & optical care',
        'Physiotherapy',
      ],
      restrictions:
        'Pre-authorization required for specialist referrals and surgeries; excludes Category A tertiary hospitals.',
    },
    {
      name: 'HyPrime Plus',
      category: 'Retail & Executive',
      summary:
        'Top Hygeia plan unlocking Category A, B, C & D hospitals (including Cedarcrest & Nisa Premier), major surgeries, and CT/MRI.',
      benefits: [
        'Full Category A-D Abuja hospital network',
        'Private room admission',
        'Major surgeries & ICU stabilization',
        'CT Scan & MRI diagnostics',
        'Annual wellness screening',
      ],
      restrictions:
        'Pre-authorization required for Category A admissions and advanced imaging.',
    },
    {
      name: 'HyMat',
      category: 'Maternity Plan',
      summary:
        'Dedicated maternity health plan covering antenatal care, normal/assisted delivery, C-section, and neonatal care at Category B/C hospitals.',
      benefits: [
        'Antenatal consultations & routine scans',
        'Normal delivery & medically necessary C-section',
        'Postnatal & neonatal care',
        'Outpatient medical care',
      ],
      restrictions:
        'Available at designated Category B & C maternity hospitals.',
    },
    {
      name: 'HyMat Plus',
      category: 'Maternity Plan (Premium)',
      summary:
        'Premium maternity plan unlocking Category A & B Abuja specialist maternity hospitals (including Nisa Premier & Cedarcrest).',
      benefits: [
        'Category A & B specialist maternity hospitals',
        'Private ward delivery & C-section',
        'NICU & neonatal specialist care',
        'Comprehensive antenatal & postnatal care',
      ],
      restrictions:
        'Pre-authorization required prior to delivery admission.',
    },
  ],
  // Leadway Health
  LEADWAY: [
    {
      name: 'Plus',
      category: 'Corporate',
      summary:
        'Entry corporate primary care plan covering GP consultations, basic lab tests, and generic drugs at Category D/C clinics.',
      benefits: [
        'General practitioner consultations',
        'Basic malaria & blood diagnostics',
        'Primary care prescriptions',
        'Emergency stabilization',
      ],
      restrictions:
        'Restricted to primary care facilities; excludes Tier-1 specialist hospitals.',
    },
    {
      name: 'Pro',
      category: 'Corporate',
      summary:
        'Standard corporate tier adding referred specialist visits, basic dental/optical, and maternity care.',
      benefits: [
        'GP & referred specialist consultations',
        'Standard laboratory & X-Ray',
        'Basic dental & optical',
        'Antenatal & delivery',
      ],
      restrictions:
        'Secondary care and specialist visits require a Leadway pre-authorization code.',
    },
    {
      name: 'Max',
      category: 'Corporate',
      summary:
        'Mid-to-high corporate tier with semi-private admission, optical lenses, dental, and intermediate surgeries.',
      benefits: [
        'Semi-private ward admission',
        'Optical frames & lenses',
        'Dental scaling & extractions',
        'Minor & intermediate surgeries',
      ],
      restrictions:
        'Elective surgeries and advanced scans require prior authorization.',
    },
    {
      name: 'Pro Max',
      category: 'Corporate',
      summary:
        'Comprehensive corporate coverage (PROMAX / PROMAXFAM) with private ward admission and wide Abuja specialist access.',
      benefits: [
        'Private room admission',
        'Access to major specialist hospitals',
        'CT Scan & MRI',
        'Comprehensive maternity & neonatal care',
      ],
      restrictions:
        'Pre-authorization required for tertiary admissions and CT/MRI imaging.',
    },
    {
      name: 'Magnum',
      category: 'Corporate',
      summary:
        'Executive corporate plan granting access to Tier-1 Abuja hospitals, major surgeries, and annual health checks.',
      benefits: [
        'Tier-1 Abuja private hospitals',
        'Annual comprehensive wellness check',
        'Major surgeries',
        'Expanded dental & optical limits',
      ],
      restrictions:
        'Pre-authorization required for major surgical procedures.',
    },
    {
      name: 'Magnum Plus',
      category: 'Corporate',
      summary:
        'Flagship executive corporate plan with unrestricted Abuja provider network access and highest annual benefit limits.',
      benefits: [
        'Full Abuja network including Cedarcrest & Nisa Premier',
        'Executive wellness screening',
        'ICU & emergency care',
      ],
      restrictions:
        'Subject to annual policy benefit limits.',
    },
    {
      name: 'Strawberry',
      category: 'Retail (Berry Series)',
      summary:
        'Entry individual retail plan for Category D primary care clinics, malaria treatment, and routine labs.',
      benefits: [
        'Outpatient GP consultations',
        'Basic lab tests',
        'Acute prescribed medications',
      ],
      restrictions:
        'Category D primary clinics only; excludes maternity, optical, dental, and specialist hospitals.',
    },
    {
      name: 'Cranberry',
      category: 'Retail (Berry Series)',
      summary:
        'Individual retail plan covering outpatient care, routine diagnostics, and general ward admission at Category D providers.',
      benefits: [
        'GP & referred consultations',
        'Standard lab tests & ultrasound',
        'General ward admission',
      ],
      restrictions:
        'Waiting periods apply for surgeries; excludes Tier-1 hospitals.',
    },
    {
      name: 'Blueberry',
      category: 'Retail (Berry Series)',
      summary:
        'Mid-tier retail plan covering Category C & D hospitals with maternity, basic dental/optical, and surgical cover.',
      benefits: [
        'Category C & D hospitals',
        'Antenatal & delivery (after waiting period)',
        'Basic dental & optical',
        'Semi-private ward',
      ],
      restrictions:
        'Moratorium applies to maternity on new retail policies; excludes Category A tertiary hospitals.',
    },
    {
      name: 'Blackberry',
      category: 'Retail (Berry Series)',
      summary:
        'Upper retail plan granting access to Category B, C & D Abuja hospitals with private room and specialist care.',
      benefits: [
        'Category B, C & D hospitals',
        'Private ward admission',
        'Specialist consultations',
        'CT/MRI imaging support',
      ],
      restrictions:
        'Pre-authorization required for advanced imaging and surgeries.',
    },
    {
      name: 'Raspberry',
      category: 'Retail (Berry Series)',
      summary:
        'Top retail plan with full Category A-D Abuja hospital network access and comprehensive surgical/maternity limits.',
      benefits: [
        'Full Abuja network access',
        'Annual wellness screening',
        'Major surgeries',
        'Comprehensive maternity, dental & optical',
      ],
      restrictions:
        'Pre-authorization required for inpatient admissions.',
    },
  ],
  // Police HMO (PHML / NHIA)
  POLICE_HMO: [
    {
      name: 'NPF Serving Officers & Families',
      category: 'Police & Statutory (NHIA)',
      summary:
        'Comprehensive NHIA healthcare coverage for active Nigeria Police Force officers, spouses, and up to 4 biological dependents.',
      benefits: [
        'Outpatient GP & specialist consultations',
        'NHIA essential drug list (10% co-pay)',
        'Maternity, antenatal & routine immunization',
        'Diagnostics, X-Ray & surgical procedures',
      ],
      restrictions:
        'Enrollees must visit their registered primary provider first; secondary/tertiary specialist care requires a referral and PHML/NHIA authorization code.',
    },
    {
      name: 'Police Retirees Health Scheme',
      category: 'Retirees (NHIA)',
      summary:
        'Dedicated NHIA medical coverage for retired Police officers and their spouses across 4,000+ accredited facilities.',
      benefits: [
        'Outpatient & inpatient medical care',
        'Chronic condition management (hypertension, diabetes, arthritis)',
        'Ophthalmology & dental care',
        'Spouse remains covered even if retiree is deceased',
      ],
      restrictions:
        'Secondary referrals require authorization from primary healthcare provider.',
    },
    {
      name: 'GIFSHIP (Individual & Family)',
      category: 'Public / Self-Employed',
      summary:
        'Group, Individual and Family Social Health Insurance Programme administered by Police HMO for civilians, families, and SMEs.',
      benefits: [
        'Choice of NHIA-accredited Abuja hospital at registration',
        'Primary consultations, malaria & lab tests',
        'Maternity & child health services',
        'General ward admission & listed surgeries',
      ],
      restrictions:
        'Mandatory 90-day waiting period after registration before accessing care; requires NHIA Unique ID at hospital desk.',
    },
  ],
  // Reliance HMO
  RELIANCE: [
    {
      name: 'Red Plan',
      category: 'Retail',
      summary:
        'Affordable individual plan providing access to over 1,400 Tier 4 community clinics, pharmacies, and 24/7 telemedicine.',
      benefits: [
        'Access to Tier 4 clinics & hospitals',
        'Outpatient GP consultations & labs',
        'Prescribed medications',
        'Free telemedicine consultations',
      ],
      restrictions:
        'Restricted to Tier 4 providers; excludes Tier 1-2 specialist hospitals.',
    },
    {
      name: 'Blue Plan',
      category: 'Retail',
      summary:
        'Expanded individual/family plan with wider Abuja hospital access, maternity, dental, optical, and surgical benefits.',
      benefits: [
        'Expanded Abuja provider network',
        'GP & specialist consultations',
        'Antenatal & delivery',
        'Basic dental & optical care',
        'Semi-private ward',
      ],
      restrictions:
        'Pre-authorization required for specialist referrals, optical/dental, and admissions.',
    },
    {
      name: 'Red Beryl',
      category: 'SME & Corporate',
      summary:
        'Small business plan with N2,000,000 annual benefit limit, access to 1,407+ Tier 4 providers, N15k dental, and N25k optical.',
      benefits: [
        'N2,000,000 annual benefit limit',
        '1,407+ network providers',
        'Up to N25,000 optical & N15,000 dental',
        'Maternity & childhood immunizations (0-5 yrs)',
      ],
      restrictions:
        'Tier 4 hospital network; pre-authorization required for secondary care.',
    },
    {
      name: 'Diamond',
      category: 'SME & Corporate',
      summary:
        'High-tier corporate plan with N5,000,000 annual limit, private wards, 2,641+ providers, N75k dental, and N105k optical.',
      benefits: [
        'N5,000,000 annual benefit limit',
        '2,641+ providers including major Abuja specialist hospitals',
        'Private ward admission',
        'Up to N105,000 optical & N75,000 dental',
        'Regular staff wellness checks',
      ],
      restrictions:
        'Pre-authorization required for inpatient admissions and surgeries.',
    },
    {
      name: 'Red Diamond',
      category: 'Executive',
      summary:
        'Reliance HMO ultimate plan with N7,000,000 annual limit, private wards, and full access to all 2,746+ providers including Cedarcrest.',
      benefits: [
        'N7,000,000 annual benefit limit',
        'Full 2,746+ provider network (Tier 1-4)',
        'Private ward & ICU access',
        'Up to N140,000 optical & N100,000 dental',
        'Comprehensive surgical & maternity cover',
      ],
      restrictions:
        'Pre-authorization required for elective procedures.',
    },
  ],
};
