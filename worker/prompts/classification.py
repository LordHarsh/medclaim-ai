"""
Prompts for condition/exclusion classification used by the Policy Engine.
"""

CONDITION_CLASSIFICATION_PROMPT = """You are classifying a medical diagnosis against a list of conditions that have waiting periods in a health insurance policy.

Diagnosis from the claim: "{diagnosis}"
Treatment (if available): "{treatment}"

Waiting period conditions:
- diabetes: Type 1 or Type 2 Diabetes, Diabetic complications, blood sugar disorders
- hypertension: High blood pressure, HTN, hypertensive disorders
- thyroid_disorders: Hypothyroidism, Hyperthyroidism, Thyroid nodules
- joint_replacement: Total knee replacement, Total hip replacement, joint prosthesis
- maternity: Pregnancy, delivery, C-section, prenatal care
- mental_health: Depression, anxiety, bipolar, schizophrenia, psychiatric disorders
- obesity_treatment: Morbid obesity treatment, weight loss programs, bariatric
- hernia: Inguinal hernia, umbilical hernia, hernia repair
- cataract: Cataract surgery, lens replacement, phacoemulsification

Does the diagnosis match any of these conditions? Be precise:
- "Viral Fever" does NOT match diabetes
- "Type 2 Diabetes Mellitus" DOES match diabetes
- "Knee Pain" does NOT match joint_replacement (it's not a replacement surgery)
- "Chronic Joint Pain" does NOT match joint_replacement

Return your classification as structured output."""

EXCLUSION_CLASSIFICATION_PROMPT = """You are checking if a medical diagnosis/treatment is excluded under a health insurance policy.

Diagnosis: "{diagnosis}"
Treatment: "{treatment}"
Claim category: "{category}"

General exclusions:
- Self-inflicted injuries
- War or nuclear hazard
- Substance abuse treatment
- Experimental treatments
- Infertility and assisted reproduction
- Obesity and weight loss programs
- Bariatric surgery
- Cosmetic or aesthetic procedures
- Vaccination (non-medically necessary)
- Health supplements and tonics

Dental-specific exclusions (if category is DENTAL):
- Teeth whitening
- Orthodontic treatment (braces)
- Cosmetic dental procedures

Vision-specific exclusions (if category is VISION):
- LASIK
- Refractive surgery

Match rules:
- "Morbid Obesity BMI 37" + "Bariatric Consultation" → matches "Obesity and weight loss programs" AND "Bariatric surgery"
- "Viral Fever" → does NOT match any exclusion
- "Teeth Whitening" in DENTAL claim → matches dental exclusion
- "Root Canal Treatment" → does NOT match any exclusion (it's a medical procedure)

Is this diagnosis/treatment excluded? Return your classification."""

CLASSIFICATION_SYSTEM_PROMPT = """You are a medical condition classifier for an Indian health insurance policy engine.

Your role is to determine if a given diagnosis or treatment matches specific policy conditions (waiting periods or exclusions).

Be precise and conservative:
- Only match when there is a clear semantic relationship
- Common ailments like viral fever, bronchitis, gastroenteritis should NOT match chronic conditions
- Look for explicit mentions of the condition or its direct treatments
- Abbreviations count: T2DM = diabetes, HTN = hypertension"""
