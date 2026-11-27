% Examance: source provenance for click-to-source and inline editing (issue #347), merged last by build-engine.sh.
% Every token remembers where it came from: |prov_cur| is line*4096+column (UTF-16) of the token last read when it
% came from the main file (|in_open=1|), else 0; token nodes keep it in |prov_mem| (parallel to |mem|, C side in
% provenance.c), and {\sl Sync\TeX} stamps it on every node it records instead of the plain file line, so a glue
% record (an interword space) names the exact source column, also inside macro arguments. Every record of the main
% file (tag 1) is packed; column 4095 means template code run while the main file was read. Shipping a native word
% writes its glyph positions to main.prov (|prov_word|), in the coordinates of the {\sl Sync\TeX} records.

@x
@!native_text_size: integer; { size of buffer }
@y
@!native_text_size: integer; { size of buffer }
@!prov_k: integer; { provenance: column of the character just read }
@z

@x
@!stat incr(dyn_used);@+tats@;{maintain statistics}
get_avail:=p;
@y
@!stat incr(dyn_used);@+tats@;{maintain statistics}
prov_set(p, prov_cur);
get_avail:=p;
@z

@x
  else  begin avail:=link(#); link(#):=null;
    @!stat incr(dyn_used);@+tats@/
@y
  else  begin avail:=link(#); link(#):=null; prov_set(#, prov_cur);
    @!stat incr(dyn_used);@+tats@/
@z

@x
  begin cur_chr:=buffer[loc]; incr(loc);
@y
  begin cur_chr:=buffer[loc]; incr(loc);
  if in_open=1 then begin
    prov_k:=loc-1-start; if prov_k>4094 then prov_k:=4094; {4095 marks template code}
    if line<524288 then prov_cur:=line*4096+prov_k else prov_cur:=0;
    end
  else prov_cur:=0;
@z

@x
  begin t:=info(loc); loc:=link(loc); {move to next}
@y
  begin t:=info(loc); prov_cur:=prov_get(loc); loc:=link(loc); {move to next}
@z

@x
zmem := yzmem - mem_min;   {this pointer arithmetic fails with some compilers}
@y
zmem := yzmem - mem_min;   {this pointer arithmetic fails with some compilers}
prov_alloc(mem_min, mem_max);
@z

@x
  zmem := yzmem - mem_bot;   {Some compilers require |mem_bot=0|}
@y
  zmem := yzmem - mem_bot;   {Some compilers require |mem_bot=0|}
  prov_alloc(mem_bot, mem_top);
@z

@x
    end else begin
      if subtype(p)=native_word_node_AT then begin
@y
    end else begin
      prov_word(p, cur_h, cur_v, total_pages+1, font_size[f]);
      if subtype(p)=native_word_node_AT then begin
@z

@x
  sync_tag(r+s):=synctex_tag;
  sync_line(r+s):=line;
@y
  if prov_cur<>0 then begin sync_tag(r+s):=1; sync_line(r+s):=prov_cur; end
  else if (synctex_tag=1)and(line<524288) then begin
    sync_tag(r+s):=1; sync_line(r+s):=line*4096+4095; {template code while reading the main file: no column}
    end
  else begin sync_tag(r+s):=synctex_tag; sync_line(r+s):=line; end;
@z
