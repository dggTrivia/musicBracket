import { loadBracket, type ShareEnvironment } from "../../../server/brackets";

export const onRequest = (context: {
  request: Request;
  env: ShareEnvironment;
  params: { id: string };
}) => loadBracket(context.request, context.env, context.params.id);
