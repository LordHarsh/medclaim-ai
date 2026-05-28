FROM public.ecr.aws/lambda/python:3.12

# Install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy application code
COPY handler.py ${LAMBDA_TASK_ROOT}/
COPY pipeline.py ${LAMBDA_TASK_ROOT}/
COPY state.py ${LAMBDA_TASK_ROOT}/
COPY config.py ${LAMBDA_TASK_ROOT}/
COPY db.py ${LAMBDA_TASK_ROOT}/
COPY agents/ ${LAMBDA_TASK_ROOT}/agents/
COPY prompts/ ${LAMBDA_TASK_ROOT}/prompts/
COPY models/ ${LAMBDA_TASK_ROOT}/models/

# Set the handler
CMD ["handler.lambda_handler"]
