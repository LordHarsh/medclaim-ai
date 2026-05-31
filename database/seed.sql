-- MedClaim.AI Seed Data
-- Seeds members from policy_terms.json and inserts policy config
-- Note: Dependents without explicit join_date use their primary member's join_date

-- ============================================================
-- SEED MEMBERS (10 employees + 2 dependents = 12 total)
-- ============================================================

-- Insert employees first (no primary_member_id dependency)
INSERT INTO members (member_id, name, date_of_birth, gender, relationship, join_date, dependents)
VALUES
    ('EMP001', 'Rajesh Kumar',   '1985-03-15', 'M', 'SELF', '2024-04-01', ARRAY['DEP001', 'DEP002']),
    ('EMP002', 'Priya Singh',    '1990-07-22', 'F', 'SELF', '2024-04-01', '{}'),
    ('EMP003', 'Amit Verma',     '1988-11-05', 'M', 'SELF', '2024-04-01', ARRAY['DEP003']),
    ('EMP004', 'Sneha Reddy',    '1992-02-28', 'F', 'SELF', '2024-04-01', '{}'),
    ('EMP005', 'Vikram Joshi',   '1979-09-10', 'M', 'SELF', '2024-09-01', '{}'),
    ('EMP006', 'Kavita Nair',    '1983-06-18', 'F', 'SELF', '2024-04-01', '{}'),
    ('EMP007', 'Suresh Patil',   '1975-12-30', 'M', 'SELF', '2024-04-01', ARRAY['DEP004', 'DEP005']),
    ('EMP008', 'Ravi Menon',     '1987-04-14', 'M', 'SELF', '2024-04-01', '{}'),
    ('EMP009', 'Anita Desai',    '1993-08-25', 'F', 'SELF', '2024-04-01', '{}'),
    ('EMP010', 'Deepak Shah',    '1980-01-07', 'M', 'SELF', '2024-04-01', ARRAY['DEP006'])
ON CONFLICT (member_id) DO NOTHING;

-- Insert dependents (reference primary_member_id)
INSERT INTO members (member_id, name, date_of_birth, gender, relationship, join_date, primary_member_id)
VALUES
    ('DEP001', 'Sunita Kumar', '1987-05-20', 'F', 'SPOUSE', '2024-04-01', 'EMP001'),
    ('DEP002', 'Arjun Kumar',  '2015-08-12', 'M', 'CHILD',  '2024-04-01', 'EMP001')
ON CONFLICT (member_id) DO NOTHING;

-- ============================================================
-- SEED POLICY CONFIG
-- ============================================================

INSERT INTO policy_config (policy_id, config_json)
VALUES (
    'PLUM_GHI_2024',
    '{
      "policy_id": "PLUM_GHI_2024",
      "policy_name": "Group Health Insurance — Standard Plan",
      "insurer": "ICICI Lombard General Insurance",
      "policy_holder": {
        "company_name": "TechCorp Solutions Pvt Ltd",
        "employee_count": 500,
        "policy_start_date": "2024-04-01",
        "policy_end_date": "2025-03-31",
        "renewal_status": "ACTIVE"
      },
      "coverage": {
        "sum_insured_per_employee": 500000,
        "annual_opd_limit": 50000,
        "per_claim_limit": 5000,
        "family_floater": {
          "enabled": true,
          "combined_limit": 150000,
          "covered_relationships": ["SELF", "SPOUSE", "CHILDREN", "PARENTS"]
        }
      },
      "opd_categories": {
        "consultation": {
          "sub_limit": 2000,
          "copay_percent": 10,
          "network_discount_percent": 20,
          "requires_prescription": true,
          "requires_pre_auth": false,
          "covered": true
        },
        "diagnostic": {
          "sub_limit": 10000,
          "copay_percent": 0,
          "network_discount_percent": 10,
          "requires_prescription": true,
          "requires_pre_auth": false,
          "pre_auth_threshold": 10000,
          "high_value_tests_requiring_pre_auth": ["MRI", "CT Scan", "PET Scan"],
          "covered": true
        },
        "pharmacy": {
          "sub_limit": 15000,
          "copay_percent": 0,
          "branded_drug_copay_percent": 30,
          "generic_mandatory": true,
          "requires_prescription": true,
          "covered": true
        },
        "dental": {
          "sub_limit": 10000,
          "copay_percent": 0,
          "requires_prescription": false,
          "requires_dental_report": true,
          "covered": true,
          "covered_procedures": [
            "Root Canal Treatment",
            "Tooth Extraction",
            "Dental Filling",
            "Scaling and Polishing",
            "Dental X-Ray",
            "Crown Placement",
            "Gum Treatment"
          ],
          "excluded_procedures": [
            "Teeth Whitening",
            "Veneers",
            "Orthodontic Treatment (Braces)",
            "Implants (Cosmetic)",
            "Bleaching"
          ]
        },
        "vision": {
          "sub_limit": 5000,
          "copay_percent": 0,
          "requires_prescription": true,
          "covered": true,
          "covered_items": ["Glasses", "Contact Lenses", "Eye Examination", "Cataract Surgery"],
          "excluded_items": ["LASIK Surgery", "Cosmetic Eye Surgery", "Refractive Surgery"]
        },
        "alternative_medicine": {
          "sub_limit": 8000,
          "copay_percent": 0,
          "requires_prescription": true,
          "requires_registered_practitioner": true,
          "max_sessions_per_year": 20,
          "covered_systems": ["Ayurveda", "Homeopathy", "Unani", "Siddha", "Naturopathy"],
          "covered": true
        }
      },
      "waiting_periods": {
        "initial_waiting_period_days": 30,
        "pre_existing_conditions_days": 365,
        "specific_conditions": {
          "diabetes": 90,
          "hypertension": 90,
          "thyroid_disorders": 90,
          "joint_replacement": 730,
          "maternity": 270,
          "mental_health": 180,
          "obesity_treatment": 365,
          "hernia": 365,
          "cataract": 365
        }
      },
      "exclusions": {
        "conditions": [
          "Self-inflicted injuries",
          "War or nuclear hazard",
          "Substance abuse treatment",
          "Experimental treatments",
          "Infertility and assisted reproduction",
          "Obesity and weight loss programs",
          "Bariatric surgery",
          "Cosmetic or aesthetic procedures",
          "Vaccination (non-medically necessary)",
          "Health supplements and tonics"
        ],
        "dental_exclusions": [
          "Teeth whitening",
          "Orthodontic treatment",
          "Cosmetic dental procedures"
        ],
        "vision_exclusions": [
          "LASIK",
          "Refractive surgery"
        ]
      },
      "pre_authorization": {
        "required_for": [
          "MRI scan (amount > 10000)",
          "CT scan (amount > 10000)",
          "PET scan",
          "Major surgical procedures",
          "Planned hospitalization"
        ],
        "validity_days": 30
      },
      "network_hospitals": [
        "Apollo Hospitals",
        "Fortis Healthcare",
        "Max Healthcare",
        "Manipal Hospitals",
        "Narayana Health",
        "Medanta",
        "Kokilaben Dhirubhai Ambani Hospital",
        "Aster CMI Hospital",
        "Columbia Asia",
        "Sakra World Hospital"
      ],
      "submission_rules": {
        "deadline_days_from_treatment": 30,
        "minimum_claim_amount": 500,
        "currency": "INR"
      },
      "document_requirements": {
        "CONSULTATION": {
          "required": ["PRESCRIPTION", "HOSPITAL_BILL"],
          "optional": ["LAB_REPORT", "DIAGNOSTIC_REPORT"]
        },
        "DIAGNOSTIC": {
          "required": ["PRESCRIPTION", "LAB_REPORT", "HOSPITAL_BILL"],
          "optional": ["DISCHARGE_SUMMARY"]
        },
        "PHARMACY": {
          "required": ["PRESCRIPTION", "PHARMACY_BILL"],
          "optional": []
        },
        "DENTAL": {
          "required": ["HOSPITAL_BILL"],
          "optional": ["PRESCRIPTION", "DENTAL_REPORT"]
        },
        "VISION": {
          "required": ["PRESCRIPTION", "HOSPITAL_BILL"],
          "optional": []
        },
        "ALTERNATIVE_MEDICINE": {
          "required": ["PRESCRIPTION", "HOSPITAL_BILL"],
          "optional": []
        }
      },
      "fraud_thresholds": {
        "same_day_claims_limit": 2,
        "monthly_claims_limit": 6,
        "high_value_claim_threshold": 25000,
        "auto_manual_review_above": 25000,
        "fraud_score_manual_review_threshold": 0.80
      },
      "evaluation_rules": [
        {"id": "member_eligibility", "type": "deterministic", "blocking": true, "order": 1},
        {"id": "submission_deadline", "type": "deterministic", "blocking": true, "order": 2},
        {"id": "minimum_amount", "type": "deterministic", "blocking": true, "order": 3},
        {"id": "initial_waiting_period", "type": "deterministic", "blocking": true, "order": 4},
        {"id": "condition_waiting_period", "type": "llm_classification", "blocking": true, "order": 5},
        {"id": "exclusion_check", "type": "llm_classification", "blocking": true, "order": 6},
        {"id": "pre_authorization", "type": "deterministic", "blocking": true, "order": 7},
        {"id": "per_claim_limit", "type": "deterministic", "blocking": true, "order": 8},
        {"id": "procedure_coverage", "type": "deterministic", "blocking": false, "order": 9},
        {"id": "amount_calculation", "type": "deterministic", "blocking": false, "order": 10}
      ]
    }'::jsonb
)
ON CONFLICT (policy_id) DO UPDATE SET
    config_json = EXCLUDED.config_json,
    updated_at = NOW();
