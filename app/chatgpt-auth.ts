// Portable deployment: identities come only from server-validated cookies.
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{return null;}
export const chatGPTSignInPath=(_returnTo:string)=>'/admin';
export const chatGPTSignOutPath=(_returnTo:string)=>'/admin';
