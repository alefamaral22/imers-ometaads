/**
 * Categorias de criativos com prompt profissional por nicho. Cada categoria embute diretrizes de
 * design específicas do segmento — paleta, elementos visuais, tom, composição — para que o resultado
 * pareça feito por um designer senior, não por IA genérica.
 */

export interface CreativeCategory {
  id: string;
  label: string;
  description: string;
  /** Prompt de design profissional (inglês p/ melhor resultado no gpt-image-1). O `{userPrompt}` é substituído pelo texto do usuário. */
  promptTemplate: string;
}

export const CREATIVE_CATEGORIES: CreativeCategory[] = [
  {
    id: 'trafego-pago',
    label: 'Tráfego Pago / Marketing Digital',
    description: 'Cursos, mentorias e serviços de gestão de tráfego',
    promptTemplate: `Create a premium paid-traffic / digital marketing course advertisement flyer.
Style: dark luxurious background (deep purple, navy or black) with bold neon accent glows (cyan, magenta, electric purple).
Must include: bold modern sans-serif typography hierarchy, geometric light effects, abstract data/dashboard elements in the background, professional confident energy.
Composition: clean asymmetric layout with strong focal point, ample breathing room, no clutter.
Vibe: high-ticket course, exclusivity, results-driven, tech-premium aesthetic like top Brazilian info-product launches.
Subject: {userPrompt}`,
  },
  {
    id: 'delivery',
    label: 'Delivery / Restaurante',
    description: 'Pizzarias, hamburguerias, comida japonesa, açaí',
    promptTemplate: `Create a mouth-watering food delivery / restaurant advertisement flyer.
Style: warm rich tones (deep red, burnt orange, golden amber) on dark or wood-textured background.
Must include: hero food photography style (dramatic lighting, steam/sauce drips, extreme close-up angles), bold price callouts in ribbon/badge shapes, appetizing color grading.
Composition: food as the undeniable hero, overlapping elements for depth, bold condensed typography for prices and CTAs.
Vibe: irresistible craving, premium street food, Instagram-worthy plating, urgency (limited offer feel).
Subject: {userPrompt}`,
  },
  {
    id: 'loja',
    label: 'Loja / E-commerce',
    description: 'Roupas, acessórios, eletrônicos, varejo',
    promptTemplate: `Create a sleek e-commerce / retail store promotional flyer.
Style: clean minimalist with bold accent color pops, gradient backgrounds (soft pastels or bold saturated depending on product), lifestyle aspirational feel.
Must include: product showcase with subtle shadow/reflection, percentage-off badges, clean grid or diagonal layout, modern geometric frames.
Composition: product-first with lifestyle context, whitespace-driven, scannable hierarchy (brand → product → price → CTA).
Vibe: trendy, accessible luxury, flash-sale urgency, Instagram-shop aesthetic.
Subject: {userPrompt}`,
  },
  {
    id: 'clinica',
    label: 'Clínica / Saúde',
    description: 'Dentistas, dermatologistas, clínicas estéticas, médicos',
    promptTemplate: `Create a trustworthy healthcare / medical clinic advertisement flyer.
Style: clean, clinical yet warm — soft blues, teals, whites with subtle gold or green accents. Soft gradients, rounded shapes.
Must include: professional medical imagery (subtle), trust-building elements (clean lines, symmetry), soft lighting, calming color palette.
Composition: centered and balanced, generous whitespace, clear information hierarchy, subtle geometric patterns.
Vibe: professional trustworthiness, modern medicine, patient comfort, premium care facility.
Subject: {userPrompt}`,
  },
  {
    id: 'imobiliaria',
    label: 'Imobiliária / Imóveis',
    description: 'Construtoras, corretores, lançamentos, aluguel',
    promptTemplate: `Create a premium real estate / property advertisement flyer.
Style: sophisticated dark or golden palette (navy + gold, black + champagne, dark green + cream), luxury materials feel (marble, glass, metal textures).
Must include: architectural photography style, dramatic perspective angles, elegant serif or modern geometric typography, price/specs in refined callout boxes.
Composition: cinematic wide aspect feel even in square format, rule-of-thirds, property as hero with lifestyle overlay.
Vibe: luxury living, investment opportunity, aspirational lifestyle, exclusive launch event.
Subject: {userPrompt}`,
  },
  {
    id: 'academia',
    label: 'Academia / Fitness',
    description: 'Crossfit, personal trainer, suplementos, yoga',
    promptTemplate: `Create a high-energy fitness / gym advertisement flyer.
Style: bold and aggressive — dark backgrounds with electric neon accents (lime green, hot orange, electric blue), dynamic diagonal lines, motion blur effects.
Must include: athletic energy, bold condensed uppercase typography, geometric shapes, sweat/power aesthetic, strong contrast.
Composition: dynamic angles (tilted grid), overlapping elements creating depth and motion, bold CTA button area.
Vibe: motivation, transformation, no-excuses energy, premium athletic facility, competition-ready.
Subject: {userPrompt}`,
  },
  {
    id: 'beleza',
    label: 'Salão de Beleza / Estética',
    description: 'Cabelo, unhas, maquiagem, procedimentos estéticos',
    promptTemplate: `Create a glamorous beauty salon / aesthetics advertisement flyer.
Style: elegant and feminine — rose gold, blush pink, champagne, soft black with metallic accents. Soft bokeh light effects, subtle sparkles.
Must include: beauty/glamour aesthetic, soft luxurious lighting, elegant script + modern sans-serif type pairing, floral or abstract organic shapes.
Composition: centered glamour shot area, soft vignette, refined border treatments, balanced asymmetry.
Vibe: self-care luxury, transformation, confidence, Instagram-worthy results, premium salon experience.
Subject: {userPrompt}`,
  },
  {
    id: 'educacao',
    label: 'Educação / Cursos Online',
    description: 'EAD, idiomas, concursos, capacitação profissional',
    promptTemplate: `Create a professional online education / course advertisement flyer.
Style: modern and inspiring — deep blue or teal gradients with warm accent highlights (gold, orange), clean geometric patterns suggesting knowledge/growth.
Must include: upward-moving visual elements (arrows, ascending lines), book/screen/graduation subtle icons, clear value proposition typography, trust badges area.
Composition: structured grid layout, clear reading path top-to-bottom, balanced info density, strong headline area.
Vibe: career advancement, accessible expertise, credibility, limited-spots urgency, professional growth.
Subject: {userPrompt}`,
  },
  {
    id: 'advocacia',
    label: 'Advogado / Escritório',
    description: 'Advocacia, contabilidade, consultoria empresarial',
    promptTemplate: `Create a prestigious law firm / professional services advertisement flyer.
Style: conservative elegance — deep navy, charcoal, burgundy with gold or bronze accents. Subtle textures (linen, leather grain). Classic proportions.
Must include: authority symbols (subtle), refined serif typography, structured columnar layout, prestige color palette, clean professional borders.
Composition: symmetrical and authoritative, generous margins, hierarchical information blocks, restrained use of imagery.
Vibe: trust, experience, gravitas, premium professional service, established reputation.
Subject: {userPrompt}`,
  },
  {
    id: 'evento',
    label: 'Evento / Show / Festa',
    description: 'Baladas, festivais, shows, formaturas, casamentos',
    promptTemplate: `Create a vibrant event / party / show advertisement flyer.
Style: bold and festive — dark background with explosive neon colors, light streaks, lens flares, confetti particles, dynamic energy.
Must include: concert/party lighting effects, bold display typography (3D, chrome, or neon style), date/venue prominent placement, ticket price callouts.
Composition: dynamic and crowded-in-a-good-way, layered depth with foreground particles, strong central focal point, radial energy emanating from center.
Vibe: unmissable event, FOMO, electric atmosphere, premium nightlife, celebration energy.
Subject: {userPrompt}`,
  },
];

/** Monta o prompt final profissional a partir da categoria + texto do usuário. */
export function buildCategoryPrompt(categoryId: string, userPrompt: string): string {
  const cat = CREATIVE_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) {
    // Fallback genérico premium se categoria não encontrada
    return [
      'Create a high-end, professionally designed advertising creative.',
      'Style: polished graphic design for paid social media ads (Meta Ads / Instagram / Facebook).',
      'Requirements: clean composition, bold typography hierarchy, strong visual contrast,',
      'premium color palette, intentional whitespace, no watermarks, no AI artifacts,',
      'no distorted text. Must look crafted by a senior graphic designer — NOT AI-generated.',
      `Subject: ${userPrompt}`,
    ].join(' ');
  }
  return cat.promptTemplate.replace('{userPrompt}', userPrompt);
}
