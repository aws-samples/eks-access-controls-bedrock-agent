# eks-access-controls-bedrock-agent

## Getting started

### Pre-requisite

You should have access to the specific base models (ENABLE IT IN THE ACCOUNT)
    - Amazon Titan Text Embeddings V2
    - Anthropic Claude 3 Haiku

## Clone GIT Repo

git clone

## Get Account ID -

```shell

AWS_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)

```

## Create S3 bucket for lambda -

```shell

aws s3 mb s3://bedrock-agent-lambda-artifacts-${AWS_ACCOUNT} --region us-east-1

```

## Install lambda dependencies

Inside eks-lambda and opensearch-lambda, run

1. npm install
2. tsc

## Package Lambda code -

Come back to the main folder

```shell

aws cloudformation package \
 --template-file eks-access-controls.yaml \
 --s3-bucket bedrock-agent-lambda-artifacts-${AWS_ACCOUNT} \
 --output-template-file eks-access-controls-template.yaml \
 --region us-east-1
 
```

## Create data source bucket -

```shell

aws s3 mb s3://eks-knowledge-base-${AWS_ACCOUNT} --region us-east-1

```

## Get the Amazon EKS User Guide -

```shell

mkdir dataSource
cd dataSource
curl https://docs.aws.amazon.com/pdfs/eks/latest/userguide/eks-ug.pdf -o eks-user-guide.pdf

aws s3 cp eks-user-guide.pdf s3://eks-knowledge-base-${AWS_ACCOUNT} \
--region us-east-1 \
--include "*.pdf"

```

## Create API Schema bucket and add the schema file -

```shell

aws s3 mb s3://eks-openapi-schema-${AWS_ACCOUNT} --region us-east-1
cd ..
aws s3 cp openapi-schema.yaml s3://eks-openapi-schema-${AWS_ACCOUNT} --region us-east-1

```

## Testing the solution

1. Deploy the CloudFormation template eks-access-controls-template.yaml.
2. Wait for the stack to get completed
3. Note down the VPC-ID, PrivateSubnetIDs and create a copy of eks-config.yaml and name it as eks-deploy.yaml and replace the VPC_ID and PRIVATE_SUBNET1 and PRIVATE_SUBNET2
4. Run CMD `eksctl create cluster -f eks-deploy.yaml` to create the cluster for testing.
5. After creation of cluster Note the IAM Role attached to the Lambda function created in Step-2.
6. Create an access entry for that Role in the cluster created in Step-4 with `AmazonEKSClusterAdminPolicy`.
7. Create an inbound security group rule in cluster security group allowing all the traffic from your lambda function.
8. Now Open Bedrock agent and prepare it for use.
9. Create a temporary prompt to test with the bedrock agent.
