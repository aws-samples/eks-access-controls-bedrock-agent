# First Deploy

This guide help you to deploy this solution in your AWS account, if you are deploying it for the first time.

## Pre-requisite

- Your CLI should have AWS account programmatic access. (aws configure)
- You should have access to the specific base models (ENABLE IT IN THE AWS ACCOUNT)
  - Amazon Titan Text Embeddings V2
  - Anthropic Claude 3 Haiku

## Clone this Repository

```shell
git clone https://github.com/aws-samples/eks-access-controls-bedrock-agent.git
```

## Get Account ID -

```shell

AWS_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)

```

## Create S3 bucket for lambda functions -

```shell

aws s3 mb s3://bedrock-agent-lambda-artifacts-${AWS_ACCOUNT} --region us-east-1

```

## Install lambda dependencies and transpile typescript code into javascript - ([Ref](https://docs.aws.amazon.com/lambda/latest/dg/lambda-typescript.html))

Inside `eks-lambda` and `opensearch-lambda` folder, run

```shell

npm install
tsc

```

## Package Lambda code and create template to deploy the required resources-

Come back to the root folder and run,

```shell

aws cloudformation package \
 --template-file eks-access-controls.yaml \
 --s3-bucket bedrock-agent-lambda-artifacts-${AWS_ACCOUNT} \
 --output-template-file eks-access-controls-template.yaml \
 --region us-east-1
 
```

This CMD would have generated a template file named as `eks-access-controls-template.yaml` in the root folder

## Create eks knowledge base bucket -

```shell

aws s3 mb s3://eks-knowledge-base-${AWS_ACCOUNT} --region us-east-1

```

## Get the Amazon EKS User Guide and put it inside the eks knowledge base bucket -

```shell

mkdir dataSource
cd dataSource
curl https://docs.aws.amazon.com/pdfs/eks/latest/userguide/eks-ug.pdf -o eks-user-guide.pdf

aws s3 cp eks-user-guide.pdf s3://eks-knowledge-base-${AWS_ACCOUNT} \
--region us-east-1 \
--include "*.pdf"

```

## Create API Schema bucket and add the schema file -

Come back to the root folder and run,

```shell

aws s3 mb s3://eks-openapi-schema-${AWS_ACCOUNT} --region us-east-1
aws s3 cp openapi-schema.yaml s3://eks-openapi-schema-${AWS_ACCOUNT} --region us-east-1

```

## Testing the solution

1. Deploy the CloudFormation template `eks-access-controls-template.yaml`.
2. Wait for the stack to get completed.
3. Note down the `VPC-ID`, `PrivateSubnetIDs` and IAM role attached to the Lambda function `ActionGroupFunction` from the deployed stack from (Step-2).
4. Create a copy of `eks-config.yaml`file and name it as `eks-deploy.yaml`.
5. Replace the `VPC_ID`, `PRIVATE_SUBNET1` and `PRIVATE_SUBNET2` with values you got from (Step-3).
6. Run CMD `eksctl create cluster -f eks-deploy.yaml` to create the cluster for testing.
7. Create an access entry for the IAM role attached to the Lambda function `ActionGroupFunction` you got in (Step-3) with `AmazonEKSClusterAdminPolicy` --- [Ref](https://docs.aws.amazon.com/eks/latest/APIReference/API_CreateAccessEntry.html).
8. Create an inbound security group rule in cluster security group allowing all the traffic from `ActionGroupFunction` lambda function.
9. Now Open Bedrock agent and prepare it for use.
10. Create a temporary prompt to test with the bedrock agent.
