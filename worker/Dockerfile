FROM amazon/aws-lambda-python:3.12

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY handler.py ${LAMBDA_TASK_ROOT}/
COPY core/ ${LAMBDA_TASK_ROOT}/core/
COPY agents/ ${LAMBDA_TASK_ROOT}/agents/
COPY prompts/ ${LAMBDA_TASK_ROOT}/prompts/
COPY models/ ${LAMBDA_TASK_ROOT}/models/

CMD ["handler.lambda_handler"]
