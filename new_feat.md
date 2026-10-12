# Nova Feature: Links

Ao programar uma viagem, é comum catalogarmos links de instagram e outras redes sociais, mas a pesquisa depois fica muito complexa.
Pensando nisso quero criar uma nova aba chamada Links.
Ela terá, no topo, um campo para colar links. Em caso de links de instagram e outras redes sociais, quero que a parte que será armazenada evite os parametros identificadores dos posts, como utm_* e outros. 


No limpador de URLs, adicione uma heurística automática para tokens opacos de compartilhamento do Instagram, sem criar uma lista de   nomes: ao iterar os parâmetros da query, remova um parâmetro adicional somente se o host for instagram.com (incluindo subdomínios),   a rota for de mídia (/p/<id> ou /reel/<id>), a chave tiver exatamente quatro letras minúsculas e todos os seus valores forem Base64
  válido que decodifica para exatamente 10 caracteres hexadecimais minúsculos (0-9a-f); mantenha intacto qualquer parâmetro que não
  cumpra todas essas condições e preserve as regras existentes de remoção por nome/prefixo. Cubra com testes os exemplos cplk, exln,
  mdxt, rpxt e srtk, além de casos negativos fora do Instagram, fora dessas rotas, com chave não alfabética ou valor Base64 de formato
  diferente.


Para cada link salvo, devemos: acessar as tags opengraph do link, incluindo a miniatura e as demais tags, texto explicativo, etc; permitir que o usuario marque tags em forma de badges de cidades (as já detectadas como destinos da viagem) e tambem o "tema", como "restaurantes", "atrações", "nightlife", "sightseeing", e outros básicos que voce possa pensar. Assim, quando um usuario colar um link, o sistema deverá:
1) permitir que o usuario selecione tags de país (se houver apenas um destino na viagem, esta virá pré-marcada), cidade (das detectadas pelo sistema na viagem) e tema
2) limpar o link conforme metodo descrito acima
3) armazenar tudo em banco de forma que se permita filtrar por país, cidade e tema; e também digitar um texto como forma de filtro. O texto deverá filtrar com substring (exemplo: a palavra "casa" na busca deve encontrar mencoes a casaco, casa e acasalamento). Caso haja disponivel nas tags opengraphs, hashtags tambem devem ser campo de filtro. A iterface deve ser organizada, armonica e pesquisavel como ajax, sem necessidade de atualizar a tela. Os resultados devem mostrar a miniatura do video, a descricao, as tags, etc.

 
