# Re-Deploy

This guide suggest how to update the deployed solution If there is any code or logic change has happened.

## Usage

If you are deploying this for the first time to your account follow this document - [First Deploy](FIRST_DEPLOY.md)

## Re-deploy/changes in code

- Get the Account ID

    ```shell

    AWS_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)

    ```

- If you have changed anything in Lambda Code. Either in `eks-lambda` or `opensearch-lambda` folder then,

    Run the following CMD in respective folder where you have changed the code, run in both if changes are done in both:

    ```shell

    npm install 
    tsc

    ```

- If you have changed anything in `openapi-schema.yaml` file then,

    Run this in the root folder

    ```shell

        aws s3 cp openapi-schema.yaml s3://eks-openapi-schema-${AWS_ACCOUNT} --region us-east-1

    ```

- Update your `eks-access-controls-template.yaml` file by running this CMD in root folder.

    ```shell

        aws cloudformation package \
        --template-file eks-access-controls.yaml \
        --s3-bucket bedrock-agent-lambda-artifacts-${AWS_ACCOUNT} \
        --output-template-file eks-access-controls-template.yaml \
        --region us-east-1

    ```

    Now you have the updated `eks-access-controls-template.yaml` file use this file to update the already deployed stack.

- Now update the deployed stack in AWS account.
