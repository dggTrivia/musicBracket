import {
  loadResultImage,
  type ImageEnvironment,
} from "../../../server/result-images";

export const onRequest = ({
  request,
  env,
  params,
}: {
  request: Request;
  env: ImageEnvironment;
  params: { id: string };
}) => loadResultImage(request, env, params.id);
