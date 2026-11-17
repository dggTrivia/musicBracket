import { createBracket, type ShareEnvironment } from "../../server/brackets";

export const onRequest = (context: {
  request: Request;
  env: ShareEnvironment;
}) => createBracket(context.request, context.env);
