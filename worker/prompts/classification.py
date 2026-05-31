from models.policy import PolicyConfig

CLASSIFICATION_SYSTEM_PROMPT = """You are a medical condition classifier for an Indian health insurance policy engine.

Your role is to determine if a given diagnosis or treatment matches specific policy conditions (waiting periods or exclusions).

Be precise and conservative:
- Only match when there is a clear semantic relationship
- Common ailments like viral fever, bronchitis, gastroenteritis should NOT match chronic conditions
- Look for explicit mentions of the condition or its direct treatments
- Abbreviations count: T2DM = diabetes, HTN = hypertension"""


# Descriptions for each condition key to help the LLM classify accurately
_CONDITION_DESCRIPTIONS = {
    "diabetes": "Type 1 or Type 2 Diabetes, Diabetic complications, blood sugar disorders",
    "hypertension": "High blood pressure, HTN, hypertensive disorders",
    "thyroid_disorders": "Hypothyroidism, Hyperthyroidism, Thyroid nodules",
    "joint_replacement": "Total knee replacement, Total hip replacement, joint prosthesis",
    "maternity": "Pregnancy, delivery, C-section, prenatal care",
    "mental_health": "Depression, anxiety, bipolar, schizophrenia, psychiatric disorders",
    "obesity_treatment": "Morbid obesity treatment, weight loss programs, bariatric",
    "hernia": "Inguinal hernia, umbilical hernia, hernia repair",
    "cataract": "Cataract surgery, lens replacement, phacoemulsification",
}


def build_condition_classification_prompt(diagnosis: str, treatment: str, policy: PolicyConfig) -> str:
    """Build condition classification prompt from policy config.

    Reads specific_conditions from the policy's waiting_periods section and
    constructs the list dynamically so that any policy changes are reflected
    automatically.
    """
    specific_conditions = policy.waiting_periods.specific_conditions

    # Build condition list lines
    condition_lines = []
    for condition_key, days in specific_conditions.items():
        description = _CONDITION_DESCRIPTIONS.get(condition_key, condition_key.replace("_", " ").title())
        condition_lines.append(f"- {condition_key}: {description} (waiting period: {days} days)")

    conditions_text = "\n".join(condition_lines) if condition_lines else "- (No specific conditions defined)"

    prompt = f"""You are classifying a medical diagnosis against a list of conditions that have waiting periods in a health insurance policy.

Diagnosis from the claim: "{diagnosis}"
Treatment (if available): "{treatment}"

Waiting period conditions:
{conditions_text}

Does the diagnosis match any of these conditions?

MATCHING RULES:
1. Only match when the diagnosis EXPLICITLY names or directly refers to one of the listed conditions
2. A diagnostic investigation (MRI, CT scan, blood test) is NOT a match — it's just a test being ordered
3. Spinal, orthopedic, neurological conditions do NOT match "joint_replacement" — only actual joint replacement SURGERY matches
4. Conditions that appear in the policy's exclusion list should NOT be matched here as waiting period conditions — they are handled separately by the exclusion check
5. Acute/common illnesses (fever, infections, pain, headaches) never match chronic condition categories
6. When in doubt, return matches_condition=false — false negatives are preferred over false positives

Return your classification as structured output."""

    return prompt


def build_exclusion_classification_prompt(
    diagnosis: str, treatment: str, category: str, policy: PolicyConfig
) -> str:
    """Build exclusion classification prompt from policy config.

    Reads general exclusions, dental exclusions, and vision exclusions from
    the policy's exclusions section and constructs the prompt dynamically.
    """
    # General exclusions
    general_exclusions = policy.exclusions.conditions
    general_lines = [f"- {excl}" for excl in general_exclusions]
    general_text = "\n".join(general_lines) if general_lines else "- (None defined)"

    # Dental-specific exclusions
    dental_exclusions = policy.exclusions.dental_exclusions
    dental_lines = [f"- {excl}" for excl in dental_exclusions]
    dental_text = "\n".join(dental_lines) if dental_lines else "- (None defined)"

    # Vision-specific exclusions
    vision_exclusions = policy.exclusions.vision_exclusions
    vision_lines = [f"- {excl}" for excl in vision_exclusions]
    vision_text = "\n".join(vision_lines) if vision_lines else "- (None defined)"

    prompt = f"""You are checking if a medical diagnosis/treatment is excluded under a health insurance policy.

Diagnosis: "{diagnosis}"
Treatment: "{treatment}"
Claim category: "{category}"

General exclusions:
{general_text}

Dental-specific exclusions (if category is DENTAL):
{dental_text}

Vision-specific exclusions (if category is VISION):
{vision_text}

Match rules:
1. Match when diagnosis/treatment semantically refers to any item in the exclusion lists above
2. Obesity, bariatric, weight loss programs are excluded under general exclusions
3. Cosmetic procedures are excluded (general + dental + vision specific lists)
4. Common medical treatments (antibiotics, consultations, diagnostics) are NOT excluded
5. When the category is DENTAL or VISION, also check category-specific exclusion lists
6. When in doubt, return is_excluded=false — false negatives are preferred over false positives

Is this diagnosis/treatment excluded? Return your classification."""

    return prompt
