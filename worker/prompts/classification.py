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

Does the diagnosis match any of these conditions? Be precise:
- "Viral Fever" does NOT match diabetes
- "Type 2 Diabetes Mellitus" DOES match diabetes
- "Knee Pain" does NOT match joint_replacement (it's not a replacement surgery)
- "Chronic Joint Pain" does NOT match joint_replacement

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
- "Morbid Obesity BMI 37" + "Bariatric Consultation" → matches "Obesity and weight loss programs" AND "Bariatric surgery"
- "Viral Fever" → does NOT match any exclusion
- "Teeth Whitening" in DENTAL claim → matches dental exclusion
- "Root Canal Treatment" → does NOT match any exclusion (it's a medical procedure)

Is this diagnosis/treatment excluded? Return your classification."""

    return prompt
