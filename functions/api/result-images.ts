import {
  createResultImage,
  type ImageEnvironment,
} from "../../server/result-images";

export const onRequest = ({
  request,
  env,
}: {
  request: Request;
  env: ImageEnvironment;
}) => createResultImage(request, env);
