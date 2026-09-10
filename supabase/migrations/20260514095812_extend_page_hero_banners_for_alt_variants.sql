BEGIN;

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/how-it-works/v2/how-it-works_v2_1920x640.webp', alt_2 = 'A British Asian family welcoming their new carer at the front door', focal_x_2 = 50, focal_y_2 = 50,
  media_url_3 = '/banners/how-it-works/v3/how-it-works_v3_1920x640.webp', alt_3 = 'A first-time meeting between a Caribbean grandfather and his new carer at the kitchen table', focal_x_3 = 50, focal_y_3 = 50,
  updated_at = now()
WHERE page_key = 'marketing.how_it_works';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/trust/v2/trust_v2_1920x640.webp', alt_2 = 'An adult son and his elderly father comparing carer profiles on a laptop at the dining table', focal_x_2 = 50, focal_y_2 = 55,
  media_url_3 = '/banners/trust/v3/trust_v3_1920x640.webp', alt_3 = 'A young couple reviewing a carer''s DBS-verified profile on a tablet on the sofa', focal_x_3 = 50, focal_y_3 = 55,
  updated_at = now()
WHERE page_key = 'marketing.trust';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/pricing/v2/pricing_v2_1920x640.webp', alt_2 = 'An adult daughter and her father going through a care budget together at home', focal_x_2 = 50, focal_y_2 = 50,
  media_url_3 = '/banners/pricing/v3/pricing_v3_1920x640.webp', alt_3 = 'A wife and husband planning care costs for his mother at the kitchen island', focal_x_3 = 50, focal_y_3 = 50,
  updated_at = now()
WHERE page_key = 'marketing.pricing';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/blog/v2/blog_v2_1920x640.webp', alt_2 = 'An older woman reading care advice on a tablet by a sunlit window', focal_x_2 = 50, focal_y_2 = 50,
  media_url_3 = '/banners/blog/v3/blog_v3_1920x640.webp', alt_3 = 'A retired couple reading the SpecialCarer blog together on a sofa with a small dog', focal_x_3 = 50, focal_y_3 = 50,
  updated_at = now()
WHERE page_key = 'marketing.blog';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/cities/v2/cities_v2_1920x640.webp', alt_2 = 'An elderly Black British couple walking arm-in-arm with their carer in a leafy London neighbourhood', focal_x_2 = 50, focal_y_2 = 50,
  media_url_3 = '/banners/cities/v3/cities_v3_1920x640.webp', alt_3 = 'An older woman and her carer sitting on a park bench overlooking a US city park', focal_x_3 = 50, focal_y_3 = 50,
  updated_at = now()
WHERE page_key = 'marketing.cities';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/employers/v2/employers_v2_1920x640.webp', alt_2 = 'A male office worker smiling at a phone update from his mother''s carer between meetings', focal_x_2 = 45, focal_y_2 = 45,
  media_url_3 = '/banners/employers/v3/employers_v3_1920x640.webp', alt_3 = 'A working mother on a video call at home, reassured her father is being well cared for', focal_x_3 = 45, focal_y_3 = 45,
  updated_at = now()
WHERE page_key = 'audience.employers';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/organisations/v2/organisations_v2_1920x640.webp', alt_2 = 'A care home manager briefing her team in a bright resident lounge', focal_x_2 = 50, focal_y_2 = 50,
  media_url_3 = '/banners/organisations/v3/organisations_v3_1920x640.webp', alt_3 = 'A domiciliary care agency director and two team leads reviewing rotas in a modern office', focal_x_3 = 50, focal_y_3 = 50,
  updated_at = now()
WHERE page_key = 'audience.organisations';

UPDATE public.page_hero_banners SET
  media_url_2 = '/banners/caregivers/v2/caregivers_v2_1920x640.webp', alt_2 = 'A confident male carer walking up to a client''s home, tote bag on shoulder, morning light', focal_x_2 = 50, focal_y_2 = 45,
  media_url_3 = '/banners/caregivers/v3/caregivers_v3_1920x640.webp', alt_3 = 'A small group of three diverse carers chatting warmly outside a London cafe after a training day', focal_x_3 = 50, focal_y_3 = 45,
  updated_at = now()
WHERE page_key = 'audience.caregivers';

COMMIT;