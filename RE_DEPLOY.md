# eks-access-controls-bedrock-agent

This repository refers to the implementations of EKS access controls using Bedrock Agent.

## Usage

To use this solution in your account follow this document - [First Deploy](FIRST_DEPLOY.md)

## Re-deploy/changes in code

```shell

    AWS_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)

```

If you have changes anything in Lambda Code either for eks-lambda or opensearch-lambda then,

Run the following CMD in respective folder:

```shell

npm install 
tsc

```

If you have changed anything OpenApi Schema then,

Run this in the root folder

```shell

    aws s3 cp openapi-schema.yaml s3://eks-openapi-schema-${AWS_ACCOUNT} --region us-east-1

```

Update your `eks-access-controls-template.yaml` file by running this CMD in root folder.

```shell

    aws cloudformation package \
    --template-file eks-access-controls.yaml \
    --s3-bucket bedrock-agent-lambda-artifacts-${AWS_ACCOUNT} \
    --output-template-file eks-access-controls-template.yaml \
    --region us-east-1

```

Now update the deployed stack in the AWS account.
