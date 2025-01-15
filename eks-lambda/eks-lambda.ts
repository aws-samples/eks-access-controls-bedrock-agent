import {Context} from "aws-lambda"
import { randomBytes } from "crypto";
import * as k8s from '@kubernetes/client-node'

import {
  EKSClient, 
  CreateAccessEntryCommand, 
  DeleteAccessEntryCommand, 
  AssociateAccessPolicyCommand, 
  ListAssociatedAccessPoliciesCommand, 
  DisassociateAccessPolicyCommand, 
  CreatePodIdentityAssociationCommand,
  DescribePodIdentityAssociationCommand,
  DeletePodIdentityAssociationCommand,
  DescribeClusterCommand,
} from "@aws-sdk/client-eks"

import {
  CreateAccessEntryCommandInput, 
  DeleteAccessEntryCommandInput, 
  AssociateAccessPolicyCommandInput, 
  AccessScopeType, 
  ListAssociatedAccessPoliciesCommandInput, 
  DisassociateAccessPolicyCommandInput , 
  CreatePodIdentityAssociationCommandInput, 
  DescribePodIdentityAssociationCommandInput,
  DeletePodIdentityAssociationCommandInput,
  
} from "@aws-sdk/client-eks";

import {
  IAMClient,
  CreateRoleCommand,
  CreateRoleCommandInput
} from "@aws-sdk/client-iam"

// import { log } from "console";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromEnv } from "@aws-sdk/credential-providers";

const STS_TOKEN_EXPIRES_IN = 200;
const CLUSTER_NAME = process.env.CLUSTER_NAME;
const cluster_cache: { [key: string]: any } = {};
const client = new EKSClient(process.config)
const iamClient = new IAMClient();

const getClusterInfo = async () => {
  const command = new DescribeClusterCommand({ name: CLUSTER_NAME });
  const response = await client.send(command);
  
  if(!response.cluster) {
    throw new Error('Cluster information not found');
  }
  
  var endpoint, ca, name;
  if(response['cluster'] != undefined){
    endpoint = response['cluster']['endpoint']
    name = response['cluster']['name']
    if(response['cluster']['certificateAuthority'] != undefined)
      ca = response['cluster']['certificateAuthority']['data']
  }
  
  return {
      endpoint: endpoint,
      ca: ca,
      clusterName: name,
  };
}

const getBearerToken = async (clusterName: string) => {
  const signer = new SignatureV4({
    credentials: fromEnv(),
    region: process.env.AWS_REGION ?? "",
    service: "sts",
    sha256: Sha256,
  });

  const request = await signer.presign(
  {
    headers: {
      host: `sts.${process.env.AWS_REGION}.amazonaws.com`,
      "x-k8s-aws-id": clusterName,
    },
    hostname: `sts.${process.env.AWS_REGION}.amazonaws.com`,
    method: "GET",
    path: "/",
    protocol: "https:",
    query: {
      Action: "GetCallerIdentity",
      Version: "2011-06-15",
    },
  },
  { expiresIn: STS_TOKEN_EXPIRES_IN }
  );

  const query = Object.keys(request?.query ?? {})
    .map(
      (q) =>
        encodeURIComponent(q) +
        "=" +
        encodeURIComponent(request.query?.[q] as string)
    )
    .join("&");

  const url = `https://${request.hostname}${request.path}?${query}`;
  const token = "k8s-aws-v1." + Buffer.from(url).toString("base64url");

  return token;
}

const generateRandomString = async () => {
  return randomBytes(Math.ceil(10 / 2))
    .toString('hex')
    .slice(0, 10);
}

export const handler = async (event: any, context: Context ) => {
    if (!CLUSTER_NAME) {
      throw new Error('EKS_CLUSTER_NAME must be set in the Lambda environment variables');
    }
    console.log("Received event", event);
    console.log("Request Body values: ", event['requestBody']['content']['application/json']['properties']);
    
    let cluster, token;
    if (CLUSTER_NAME in cluster_cache) {
        cluster = cluster_cache[CLUSTER_NAME];
    } else {
        cluster = await getClusterInfo();
        cluster_cache[CLUSTER_NAME] = cluster;
    }

    cluster = await getClusterInfo();
    if(cluster['clusterName'] != undefined)
      token = await getBearerToken(cluster['clusterName']);
    
    const kubeConfig = {
      clusters: [{
        name: 'my-cluster',
        server: cluster['endpoint'],
        caData: cluster['ca'],
      }],
      users: [{
        name: 'my-user',
        token: token,
      }],
      contexts: [{
        name: 'my-context',
        cluster: 'my-cluster',
        user: 'my-user',
      }],
      currentContext: 'my-context'
    };
    
    const kc = new k8s.KubeConfig();
    kc.loadFromOptions(kubeConfig);
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);


    // Extract the action group, api path, and parameters from the prediction
    var action = event["actionGroup"]
    var api_path = event["apiPath"]
    var httpMethod = event["httpMethod"]
    var response_body, response_code, body, command, res, reason : string;
    var clusterName, principalArn, serviceAccount, namespace, associationId, namespaces, accessPolicy, accessScope, type : AccessScopeType;
    var roleArn: string | undefined;

    if(api_path == '/create-access-entry'){

      try {
          var array = event['requestBody']['content']['application/json']['properties'];
          array.forEach((element: any) => {
            if(element['name'] == 'namespaces') {
              namespaces = element['value'];
              namespaces = namespaces.split(',');
            }
            else if(element['name'] == 'clusterName') clusterName = element['value'];
            else if(element['name'] == 'principalArn') principalArn = element['value'];
            else if(element['name'] == 'accessPolicy') accessPolicy = element['value'];
          });
          console.log("namespaces", namespaces)
          // Create Access Entry
          var input1: CreateAccessEntryCommandInput = {
            clusterName: clusterName,
            principalArn: principalArn
          }
          command = new CreateAccessEntryCommand(input1);
          res = await client.send(command);

          console.log(res);
          console.log("namespaces", namespaces)

          //Associate Access Policy
          if(namespaces != undefined){
            type = "namespace";
            accessScope = {type: type,  namespaces: namespaces};
          }
          else{
            type = "cluster";
            accessScope = {type: type};
          }
          console.log("accessScope", accessScope);

          var input2: AssociateAccessPolicyCommandInput = {
            clusterName: clusterName,
            principalArn: principalArn,
            policyArn: accessPolicy,
            accessScope: accessScope
          }

          command = new AssociateAccessPolicyCommand(input2);
          res = await client.send(command);

          body = {accessEntryArn: "Successfully created", accessPolicy: "Successfully attached to access entry"};
          response_code = 200;
          response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }

    else if(api_path == '/describe-access-entry'){

      try {
          var array = event['requestBody']['content']['application/json']['properties'];
          array.forEach((element: any) => {
            if(element['name'] == 'clusterName') clusterName = element['value'];
            else if(element['name'] == 'principalArn') principalArn = element['value'];
          });

          // Describe Access Entry's attached Access policies
          var input3: ListAssociatedAccessPoliciesCommandInput = {
            clusterName: clusterName,
            principalArn: principalArn
          }
          command = new ListAssociatedAccessPoliciesCommand(input3);
          res = await client.send(command);
          const ans = res['associatedAccessPolicies'];
          
          if(ans!=undefined){
            const newArray = ans.map(obj => {
              const newObj = { ...obj };
              delete newObj['associatedAt'];
              delete newObj['modifiedAt'];
              return newObj;
            });

            body = newArray;
            response_code = 200;
            response_body = {"application/json": {"body": JSON.stringify(body)}};
          }
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }

    else if(api_path == '/delete-access-entry'){

      try {
          var array = event['requestBody']['content']['application/json']['properties'];
          array.forEach((element: any) => {
            if(element['name'] == 'clusterName') clusterName = element['value'];
            else if(element['name'] == 'principalArn') principalArn = element['value'];
          });

          // Delete Access Entry from the EKS Cluster
          var input4: DeleteAccessEntryCommandInput = {
            clusterName: clusterName,
            principalArn: principalArn
          }
          command = new DeleteAccessEntryCommand(input4);
          res = await client.send(command);

          response_code = 200;
          response_body = {"application/json": {"body": "Successfully deleted the access entry"}};
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }

    else if(api_path == '/attach-access-policy'){

      try {
          var array = event['requestBody']['content']['application/json']['properties'];
          array.forEach((element: any) => {
            if(element['name'] == 'namespaces'){
              namespaces = element['value'];  
              namespaces = namespaces.split(',');
            }
            else if(element['name'] == 'clusterName') clusterName = element['value'];
            else if(element['name'] == 'principalArn') principalArn = element['value'];
            else if(element['name'] == 'accessPolicy') accessPolicy = element['value'];
          });

          // Attach Access policy for the Access entry
          if(namespaces != undefined){
            type = "namespace";
            accessScope = {type: type,  namespaces: namespaces};
          }
          else{
            type = "cluster";
            accessScope = {type: type};
          }
          var input5: AssociateAccessPolicyCommandInput = {
            clusterName: clusterName,
            principalArn: principalArn,
            policyArn: accessPolicy,
            accessScope: accessScope
          }
          command = new AssociateAccessPolicyCommand(input5);
          res = await client.send(command);

          response_code = 200;
          response_body = {"application/json": {"body": "Successfully attached the access policy for the access entry"}};
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }

    else if(api_path == '/delete-access-policy'){

      try {
          var array = event['requestBody']['content']['application/json']['properties'];
          array.forEach((element: any) => {
            if(element['name'] == 'clusterName') clusterName = element['value'];
            else if(element['name'] == 'principalArn') principalArn = element['value'];
            else if(element['name'] == 'accessPolicy') accessPolicy = element['value'];
          });

          // Delete Access policy from the Access entry
          var input6: DisassociateAccessPolicyCommandInput = {
            clusterName: clusterName,
            principalArn: principalArn,
            policyArn: accessPolicy
          }
          command = new DisassociateAccessPolicyCommand(input6);
          res = await client.send(command);

          response_code = 200;
          response_body = {"application/json": {"body": "Successfully deleted the access policy from the access entry"}};
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }


    else if(api_path == '/create-pod-identity-association'){

      try {
          roleArn = 'default';
          var array = event['requestBody']['content']['application/json']['properties'];
          array.forEach((element: any) => {
            if(element['name'] == 'clusterName') clusterName = element['value'];
            else if(element['name'] == 'roleArn') roleArn = element['value'];
            else if(element['name'] == 'serviceAccount') serviceAccount = element['value'];
            else if(element['name'] == 'namespace') namespace = element['value'];
          });

          if(roleArn == 'default'){
            console.log("Before if condition principalArn:", roleArn);
            let suffix_role = await generateRandomString();
            let RoleName: string = serviceAccount + "-pod-identity-Role" + suffix_role;
            const assumeRolePolicyDocument = JSON.stringify({            
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: {
                    Service: "pods.eks.amazonaws.com"
                  },
                  Action: [
                      "sts:TagSession",
                      "sts:AssumeRole"
                  ]
                }
              ]
            });
            console.log(RoleName);
            console.log(assumeRolePolicyDocument);

            var roleParams: CreateRoleCommandInput = {
              RoleName: RoleName,
              AssumeRolePolicyDocument: assumeRolePolicyDocument
            }

            console.log(roleParams);

            command = new CreateRoleCommand(roleParams);
            console.log("Made API call");
            res = await iamClient.send(command);

            console.log(res);

            if(res.Role == undefined) throw new Error("Role could not be created");
            roleArn = res.Role.Arn;
            console.log(roleArn);
          }

          console.log("After if condition principalArn:", roleArn);
          // Create Pod identity association
          var input7: CreatePodIdentityAssociationCommandInput = {
            clusterName: clusterName,
            roleArn: roleArn,
            serviceAccount: serviceAccount,
            namespace: namespace
          }
          if(input7.namespace == undefined) throw new Error("Namespace must be provided");
          if(input7.serviceAccount == undefined) throw new Error("Service Account must be provided");
          let namespace_exists = false, serviceaccount_exists = false;

          try {
            const listNamespaceResponse = await k8sApi.listNamespace();
            namespace_exists = listNamespaceResponse.items.some((item : any) => {
              console.log(item.metadata?.name);
              return item.metadata?.name === input7.namespace;
            });
            
            if(namespace_exists == true){
              const listServiceAccountResponse = await k8sApi.listNamespacedServiceAccount({namespace: input7.namespace});
              serviceaccount_exists = listServiceAccountResponse.items.some((item : any) => {
                console.log(item.metadata?.name);
                return item.metadata?.name === input7.serviceAccount
              });
              
              if(serviceaccount_exists == false){
                const serviceAccountObj = {
                  kind: 'ServiceAccount',
                  metadata: {
                      name: input7.serviceAccount
                  }
                } as k8s.V1ServiceAccount;
                    
                let newServiceAccount;
                newServiceAccount = await k8sApi.createNamespacedServiceAccount({namespace:input7.namespace, body: serviceAccountObj});
                console.log(newServiceAccount.metadata?.name);
              }
            }
            else {
              const namespaceObj = {
                kind: 'Namespace',
                metadata: {
                  name: input7.namespace
                }
              } as k8s.V1Namespace;

              const serviceAccountObj = {
                kind: 'ServiceAccount',
                metadata: {
                  name: input7.serviceAccount
                }
              } as k8s.V1ServiceAccount;

              const newNamespaceCreate = await k8sApi.createNamespace({body: namespaceObj});
              console.log(newNamespaceCreate.metadata?.name);
              const newServiceAccount = await k8sApi.createNamespacedServiceAccount({namespace: input7.namespace, body: serviceAccountObj});
              console.log(newServiceAccount.metadata?.name);
            }
          } 
          catch (err) {
            console.error(err);
          }

          command = new CreatePodIdentityAssociationCommand(input7);
          res = await client.send(command);
          const ans = res['association'];
          
          if(ans!=undefined){
              const newObj = { ...ans };
              delete newObj['tags'];
              delete newObj['createdAt'];
              delete newObj['modifiedAt'];
              delete newObj['ownerArn'];
              
              body = newObj;
              response_code = 200;
              response_body = {"application/json": {"body": JSON.stringify(body)}};
            }
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";

        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }

    else if(api_path == '/describe-pod-identity-association'){

      try {
        var array = event['requestBody']['content']['application/json']['properties'];
        array.forEach((element: any) => {
          if(element['name'] == 'clusterName') clusterName = element['value'];
          else if(element['name'] == 'associationId') associationId = element['value'];
        });
        
        // Describe Pod identity association
        var input8: DescribePodIdentityAssociationCommandInput = {
          clusterName: clusterName,
          associationId: associationId
        }
        command = new DescribePodIdentityAssociationCommand(input8);
        res = await client.send(command);
        const ans = res['association'];
        
        if(ans!=undefined){
          const newObj = { ...ans };
          delete newObj['tags'];
          delete newObj['createdAt'];
          delete newObj['modifiedAt'];
          delete newObj['ownerArn'];
          
          body = newObj;
          response_code = 200;
          response_body = {"application/json": {"body": JSON.stringify(body)}};
        }
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }

    else if(api_path == '/delete-pod-identity-association'){

      try {
        var array = event['requestBody']['content']['application/json']['properties'];
        array.forEach((element: any) => {
          if(element['name'] == 'clusterName') clusterName = element['value'];
          else if(element['name'] == 'associationId') associationId = element['value'];
        });
        
        // Delete Pod identity association
        var input9: DeletePodIdentityAssociationCommandInput = {
          clusterName: clusterName,
          associationId: associationId
        }
        command = new DeletePodIdentityAssociationCommand(input9);
        res = await client.send(command);

        response_code = 200;
        response_body = {"application/json": {"body": "Successfully deleted the pod identity association from the EKS cluster"}};
      }
      catch (error) {
        if (error instanceof Error) {
          reason = error.message + "API Call - ${api_path}";
        }
        else
          reason = "error occurred in API call ${api_path}";
        body = {error : reason};
        response_code = 400;
        response_body = {"application/json": {"body": JSON.stringify(body)}};
      }
    }


    else {
      body = {error : "Incorrect API Path. Try another way"};
      response_code = 400;
      response_body = {"application/json": {"body": JSON.stringify(body)}};
    }
  
    var action_response = {
      'actionGroup': action,
      'apiPath': api_path,
      'httpMethod': httpMethod,
      'httpStatusCode': response_code,
      'responseBody': response_body
    }
  
    var session_attributes = event['sessionAttributes']
    var prompt_session_attributes = event['promptSessionAttributes']
    var api_response = {
      'messageVersion': '1.0', 
      'response': action_response,
      'sessionAttributes': session_attributes,
      'promptSessionAttributes': prompt_session_attributes
    }

    return api_response
}