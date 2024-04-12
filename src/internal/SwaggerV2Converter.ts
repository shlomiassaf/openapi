import { OpenApi } from "../OpenApi";
import { SwaggerV2 } from "../SwaggerV2";

export namespace SwaggerV2Converter {
  export const convert = (input: SwaggerV2.IDocument): OpenApi.IDocument => ({
    openapi: "3.1.0",
    info: input.info,
    components: convertComponents(input),
    paths: input.paths
      ? Object.fromEntries(
          Object.entries(input.paths)
            .filter(([_, v]) => v !== undefined)
            .map(
              ([key, value]) => [key, convertPathItem(input)(value)] as const,
            ),
        )
      : undefined,
    servers: input.host
      ? [
          {
            url: input.host,
          },
        ]
      : undefined,
    security: input.security,
    tags: input.tags,
    "x-samchon-emended": true,
  });

  /* -----------------------------------------------------------
    OPERATORS
  ----------------------------------------------------------- */
  const convertPathItem =
    (doc: SwaggerV2.IDocument) =>
    (pathItem: SwaggerV2.IPathItem): OpenApi.IPathItem => ({
      ...(pathItem as any),
      ...(pathItem.get
        ? { get: convertOperation(doc)(pathItem)(pathItem.get) }
        : undefined),
      ...(pathItem.put
        ? { put: convertOperation(doc)(pathItem)(pathItem.put) }
        : undefined),
      ...(pathItem.post
        ? { post: convertOperation(doc)(pathItem)(pathItem.post) }
        : undefined),
      ...(pathItem.delete
        ? { delete: convertOperation(doc)(pathItem)(pathItem.delete) }
        : undefined),
      ...(pathItem.options
        ? { options: convertOperation(doc)(pathItem)(pathItem.options) }
        : undefined),
      ...(pathItem.head
        ? { head: convertOperation(doc)(pathItem)(pathItem.head) }
        : undefined),
      ...(pathItem.patch
        ? { patch: convertOperation(doc)(pathItem)(pathItem.patch) }
        : undefined),
      ...(pathItem.trace
        ? { trace: convertOperation(doc)(pathItem)(pathItem.trace) }
        : undefined),
    });
  const convertOperation =
    (doc: SwaggerV2.IDocument) =>
    (pathItem: SwaggerV2.IPathItem) =>
    (input: SwaggerV2.IOperation): OpenApi.IOperation => ({
      ...input,
      parameters: (
        [...(pathItem.parameters ?? []), ...(input.parameters ?? [])]
          .map((p) =>
            TypeChecker.isReference(p)
              ? doc.parameters?.[p.$ref.split("/").pop() ?? ""]!
              : p,
          )
          .filter(
            (p) =>
              p !== undefined &&
              (p as SwaggerV2.IOperation.IBodyParameter).schema === undefined,
          ) as SwaggerV2.IOperation.IGeneralParameter[]
      ).map(convertParameter),
      requestBody: (() => {
        const found: SwaggerV2.IOperation.IBodyParameter | undefined =
          input.parameters?.find((p) => {
            if (TypeChecker.isReference(p))
              p = doc.parameters?.[p.$ref.split("/").pop() ?? ""]!;
            return (
              (p as SwaggerV2.IOperation.IBodyParameter)?.schema !== undefined
            );
          }) as SwaggerV2.IOperation.IBodyParameter | undefined;
        return found ? convertRequestBody(found) : undefined;
      })(),
      responses: input.responses
        ? Object.fromEntries(
            Object.entries(input.responses)
              .filter(([_, v]) => v !== undefined)
              .map(
                ([key, value]) => [key, convertResponse(doc)(value)!] as const,
              )
              .filter(([_, v]) => v !== undefined),
          )
        : undefined,
    });
  const convertParameter = (
    input: SwaggerV2.IOperation.IGeneralParameter,
  ): OpenApi.IOperation.IParameter => ({
    name: input.name,
    in: input.in as any,
    description: input.description,
    schema: convertSchema(input),
    required: true,
  });
  const convertRequestBody = (
    input: SwaggerV2.IOperation.IBodyParameter,
  ): OpenApi.IOperation.IRequestBody => ({
    description: input.description,
    content: {
      "application/json": {
        schema: convertSchema(input.schema),
      },
    },
  });
  const convertResponse =
    (doc: SwaggerV2.IDocument) =>
    (
      input:
        | SwaggerV2.IOperation.IResponse
        | SwaggerV2.IJsonSchema.IReference<`#/definitions/responses/${string}`>,
    ): OpenApi.IOperation.IResponse | undefined => {
      if (TypeChecker.isReference(input)) {
        const found: SwaggerV2.IOperation.IResponse | undefined =
          doc.responses?.[input.$ref.split("/").pop() ?? ""]!;
        if (found === undefined) return undefined;
        input = found;
      }
      return {
        description: input.description,
        content: input.schema
          ? {
              "application/json": {
                schema: convertSchema(input.schema),
              },
            }
          : undefined,
        headers: input.headers
          ? Object.fromEntries(
              Object.entries(input.headers)
                .filter(([_, v]) => v !== undefined)
                .map(
                  ([key, value]) =>
                    [
                      key,
                      {
                        schema: convertSchema(value),
                        in: "header",
                      },
                    ] as const,
                ),
            )
          : undefined,
      };
    };

  /* -----------------------------------------------------------
    DEFINITIONS
  ----------------------------------------------------------- */
  const convertComponents = (
    input: SwaggerV2.IDocument,
  ): OpenApi.IComponents => ({
    schemas: Object.fromEntries(
      Object.entries(input.definitions ?? {})
        .filter(([_, v]) => v !== undefined)
        .map(([key, value]) => [key, convertSchema(value)]),
    ),
    securitySchemes: input.securityDefinitions
      ? Object.fromEntries(
          Object.entries(input.securityDefinitions)
            .filter(([_, v]) => v !== undefined)
            .map(([key, value]) => [key, convertSecurityScheme(value)])
            .filter(([_, v]) => v !== undefined),
        )
      : undefined,
  });
  const convertSecurityScheme = (
    input: SwaggerV2.ISecurityDefinition,
  ): OpenApi.ISecurityScheme => {
    if (input.type === "apiKey") return input;
    else if (input.type === "basic")
      return {
        type: "http",
        scheme: "basic",
        description: input.description,
      };
    else if (input.type === "oauth2")
      if (input.flow === "implicit")
        return {
          type: "oauth2",
          description: input.description,
          flows: {
            implicit: {
              authorizationUrl: input.authorizationUrl,
              scopes: input.scopes,
            },
          },
        };
      else if (input.flow === "accessCode")
        return {
          type: "oauth2",
          description: input.description,
          flows: {
            authorizationCode: {
              authorizationUrl: input.authorizationUrl,
              tokenUrl: input.tokenUrl,
              scopes: input.scopes,
            },
          },
        };
      else if (input.flow === "password")
        return {
          type: "oauth2",
          description: input.description,
          flows: {
            password: {
              tokenUrl: input.tokenUrl,
              scopes: input.scopes,
            },
          },
        };
      else if (input.flow === "application")
        return {
          type: "oauth2",
          description: input.description,
          flows: {
            clientCredentials: {
              tokenUrl: input.tokenUrl,
              scopes: input.scopes,
            },
          },
        };
      else return undefined!;
    return undefined!;
  };
  const convertSchema = (input: SwaggerV2.IJsonSchema): OpenApi.IJsonSchema => {
    const nullable: { value: boolean } = { value: false };
    const union: OpenApi.IJsonSchema[] = [];
    const attribute: OpenApi.IJsonSchema.__IAttribute = {
      title: input.title,
      description: input.description,
      ...Object.fromEntries(
        Object.entries(input).filter(
          ([key, value]) => key.startsWith("x-") && value !== undefined,
        ),
      ),
    };
    const visit = (schema: SwaggerV2.IJsonSchema): void => {
      if (
        (schema as SwaggerV2.IJsonSchema.__ISignificant<any>)["x-nullable"] ===
        true
      )
        nullable.value ||= true;
      // UNION TYPE CASE
      if (TypeChecker.isAnyOf(schema)) schema["x-anyOf"].forEach(visit);
      else if (TypeChecker.isOneOf(schema)) schema["x-oneOf"].forEach(visit);
      // ATOMIC TYPE CASE (CONSIDER ENUM VALUES)
      else if (
        TypeChecker.isBoolean(schema) ||
        TypeChecker.isInteger(schema) ||
        TypeChecker.isNumber(schema) ||
        TypeChecker.isString(schema)
      )
        if (schema.enum?.length)
          union.push(...schema.enum.map((value) => ({ const: value })));
        else
          union.push({
            ...schema,
            ...{ enum: undefined },
          });
      // INSTANCE TYPE CASE
      else if (TypeChecker.isArray(schema))
        union.push({
          ...schema,
          items: convertSchema(schema.items),
        });
      else if (TypeChecker.isObject(schema))
        union.push({
          ...schema,
          ...{
            properites: schema.properties
              ? Object.fromEntries(
                  Object.entries(schema.properties)
                    .filter(([_, v]) => v !== undefined)
                    .map(([key, value]) => [key, convertSchema(value)]),
                )
              : undefined,
            additionalProperties: schema.additionalProperties
              ? typeof schema.additionalProperties === "object" &&
                schema.additionalProperties !== null
                ? convertSchema(schema.additionalProperties)
                : schema.additionalProperties
              : undefined,
          },
        });
      else if (TypeChecker.isReference(schema))
        union.push({
          ...schema,
          $ref: schema.$ref.replace("#/definitions/", "#/components/schemas/"),
        });
      else union.push(schema);
    };

    visit(input);
    if (
      nullable.value === true &&
      !union.some((e) => (e as OpenApi.IJsonSchema.INull).type === "null")
    )
      union.push({ type: "null" });
    return {
      ...(union.length === 0
        ? { type: undefined }
        : union.length === 1
          ? { ...union[0] }
          : { oneOf: union }),
      ...attribute,
    };
  };

  namespace TypeChecker {
    export const isBoolean = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IBoolean =>
      (schema as SwaggerV2.IJsonSchema.IBoolean).type === "boolean";
    export const isInteger = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IInteger =>
      (schema as SwaggerV2.IJsonSchema.IInteger).type === "integer";
    export const isNumber = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.INumber =>
      (schema as SwaggerV2.IJsonSchema.INumber).type === "number";
    export const isString = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IString =>
      (schema as SwaggerV2.IJsonSchema.IString).type === "string";
    export const isArray = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IArray =>
      (schema as SwaggerV2.IJsonSchema.IArray).type === "array";
    export const isObject = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IObject =>
      (schema as SwaggerV2.IJsonSchema.IObject).type === "object";
    export const isReference = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IReference =>
      (schema as SwaggerV2.IJsonSchema.IReference).$ref !== undefined;
    export const isOneOf = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IOneOf =>
      (schema as SwaggerV2.IJsonSchema.IOneOf)["x-oneOf"] !== undefined;
    export const isAnyOf = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.IAnyOf =>
      (schema as SwaggerV2.IJsonSchema.IAnyOf)["x-anyOf"] !== undefined;
    export const isNullOnly = (
      schema: SwaggerV2.IJsonSchema,
    ): schema is SwaggerV2.IJsonSchema.INullOnly =>
      (schema as SwaggerV2.IJsonSchema.INullOnly).type === "null";
  }
}
