
UPDATE chatbot_flows 
SET nodes = '[
  {"id":"trigger-1","type":"trigger","position":{"x":250,"y":50},"data":{"triggerType":"first_message"}},
  {"id":"node_text_intro","type":"text_message","position":{"x":200,"y":170},"data":{"content":"⚠️ Atenção\n\nFornecedores sempre atualizados e com estoque!\n\nSó pra alinhar:\n\nO Mago Flix não vende streaming.\n\nEle libera acesso a contatos e fornecedores que permitem usar vários serviços pagando bem menos, tudo organizado e testado.\n\n👉 Grupo: https://chat.whatsapp.com/JPy4GlGBh9M3imbVzLdTzO\n👉 Site: https://listamagoflix.shop"}},
  {"id":"node_delay_5s","type":"delay","position":{"x":270,"y":340},"data":{"seconds":5}},
  {"id":"node_text_hook","type":"image_message","position":{"x":-255,"y":450},"data":{"caption":"Já temos mais de 500 clientes no grupo 👇  https://chat.whatsapp.com/JPy4GlGBh9M3imbVzLdTzO","imageUrl":"https://wldaesbphtpjnuabgjrf.supabase.co/storage/v1/object/public/chat-media/flow-images/1772935494904_a1cd5c92.jpeg"}},
  {"id":"node_delay_30s_a","type":"delay","position":{"x":-60,"y":650},"data":{"seconds":30}},
  {"id":"node_audio","type":"audio_ptt","position":{"x":195,"y":800},"data":{"audioUrl":"https://wldaesbphtpjnuabgjrf.supabase.co/storage/v1/object/public/chat-media/flow-audio/1772315730673_6ab91135.ogg"}},
  {"id":"node_delay_30s_b","type":"delay","position":{"x":270,"y":920},"data":{"seconds":30}},
  {"id":"node_image","type":"image_message","position":{"x":525,"y":920},"data":{"caption":"Temos os melhores fornecedores do mercado, aqueles que ninguém te conta e você nem sabia que existia.\n\nAtualizamos a lista toda semana, fornecedores testados e aprovados\n\n✅Fornecedores Testados\n✅Fornecedores atualizados\n✅O Menor preço do mundo\n✅+ de 10 Fornecedores diferentes\n\nVeja como é por dentro e teste grátis : https://listamagoflix.shop","imageUrl":"https://i.ibb.co/xtdDprPX/Whats-App-Image-2026-03-03-at-17-40-32.jpg"}},
  {"id":"node_transfer","type":"transfer_ai","position":{"x":250,"y":1200},"data":{}}
]'::jsonb,
edges = '[
  {"id":"e0","source":"trigger-1","target":"node_text_intro","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e1","source":"node_text_intro","target":"node_delay_5s","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e2","source":"node_delay_5s","target":"node_text_hook","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e3","source":"node_text_hook","target":"node_delay_30s_a","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e4","source":"node_delay_30s_a","target":"node_audio","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e5","source":"node_audio","target":"node_delay_30s_b","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e6","source":"node_delay_30s_b","target":"node_image","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}},
  {"id":"e7","source":"node_image","target":"node_transfer","type":"deletable","animated":true,"style":{"stroke":"hsl(152, 60%, 42%)"}}
]'::jsonb,
updated_at = now()
WHERE id = 'ee5a0103-db2b-47bd-8bf3-784c69933b2e';
