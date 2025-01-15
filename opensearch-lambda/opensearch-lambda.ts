import { Client } from "@opensearch-project/opensearch"
import { AwsSigv4Signer } from  "@opensearch-project/opensearch/aws"
import {CloudFormationCustomResourceEvent, Context} from "aws-lambda"
import * as response from "cfn-response-promise"

import {defaultProvider} from "@aws-sdk/credential-provider-node"

const { COLLECTION_ENDPOINT = "", VECTOR_INDEX_NAME = "", VECTOR_FIELD_NAME = "", TEXT_FIELD = "", METADATA_FIELD = ""} = process.env;

const client = new Client({
    ...AwsSigv4Signer({
      region: 'us-east-1',
      service: 'aoss',

      getCredentials: () => {
        const credentialsProvider = defaultProvider();
        return credentialsProvider();
      },
    }),
    node: COLLECTION_ENDPOINT // OpenSearch domain URL
});

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context ) => {

    console.log("Received event", event);
    let reason = "";

    if(event.RequestType == 'Create') {

        //Create index
        const body = {
            mappings: {
                properties: {
                  [METADATA_FIELD]: {
                    type: "text",
                    index: false
                  },
                  [TEXT_FIELD]: {
                    type: "text",
                    index: true
                  },
                  [VECTOR_FIELD_NAME]: {
                    type: "knn_vector",
                    dimension: 1024,
                    method: {
                      engine: "faiss",
                      space_type: "l2",
                      name: "hnsw",
                      parameters: {
                        ef_search: 512
                      }
                    }
                  }
                }
            },
            settings: {
                index: {
                  number_of_shards: 2,
                  knn: true
                }
            }
        }

        try{
          const res = await client.indices.create({
              index: VECTOR_INDEX_NAME,
              body: body,
          });
        }
        catch (error) {
          if (error instanceof Error) {
            reason = error.message;
          }
          else
            reason = "error"
          let data = { 
            Result: reason
          }
          
          return await response.send(event, context, "FAILED", data);
        }
        reason = "Applied custom resource for adding index to OpenSearch";
    }

    if(event.RequestType == 'Delete' || event.RequestType=='Update')
        reason = "Deleted custom resource"
  
    let data = {
      Result: reason
    }
    return await response.send(event, context, "SUCCESS", data);
}