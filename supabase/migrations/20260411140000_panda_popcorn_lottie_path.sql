-- Point panda plushie at bundled Lottie JSON (existing DBs that already ran game_tokens_trial)
update public.plushie_catalog
set lottie_path = '/lottie/panda-popcorn.json'
where slug = 'panda-popcorn';
