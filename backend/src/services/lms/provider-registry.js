const {createCanvasProvider}=require("./canvas.provider");
function createProviderRegistry(options={}){return{create(connection,token){if(options.factory)return options.factory(connection,token);if(connection.provider==="canvas")return createCanvasProvider({baseUrl:connection.baseUrl,accessToken:token,fetchImpl:options.fetchImpl});throw new Error(`Unsupported LMS provider: ${connection.provider}`)}}}
module.exports={createProviderRegistry};
