import { z } from "zod";

/**
 * The structural contract for what a scene-description parser must
 * produce — mass/position/velocity per object, per the spec's
 * "constrained-output prompting" stance. This is deliberately just a
 * shape contract (numbers, correct nesting): it says nothing about
 * whether a mass is *physically sane*, which is a separate concern (see
 * validate.ts) so the same two-step pipeline works unchanged once a real
 * LLM replaces the mock parser in Stage 8 — only the thing producing the
 * raw candidate object changes, not what validates it.
 */
export const ParsedObjectSchema = z.object({
  massSolarMasses: z.number().finite(),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .optional(),
  velocity: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .optional(),
});

export const ParsedSceneSchema = z.object({
  objects: z.array(ParsedObjectSchema).min(1),
});

export type ParsedObject = z.infer<typeof ParsedObjectSchema>;
export type ParsedScene = z.infer<typeof ParsedSceneSchema>;
