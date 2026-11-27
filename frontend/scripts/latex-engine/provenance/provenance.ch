% Examance: source provenance for click-to-source and inline editing (issue #347), merged last by build-engine.sh.
% Every token remembers where it came from: |prov_cur| is line*4096+column (UTF-16) of the token last read when it
% came from the main file (|in_open=1|), else 0; token nodes keep it in |prov_mem| (parallel to |mem|, C side in
% provenance.c), and {\sl Sync\TeX} stamps it on every node it records instead of the plain file line, so a glue
% record (an interword space) names the exact source column, also inside macro arguments. Every record of the main
% file (tag 1) is packed; column 4095 means template code run while the main file was read. Every character of a native
% word keeps its own origin too (a side table per node in provenance.c, filled wherever XeTeX builds, merges, splits
% or copies word nodes), and shaping keeps HarfBuzz's cluster of every glyph. Shipping a native word writes its glyph
% positions, its characters' origins and its glyphs' clusters to main.prov (|prov_word|), in the coordinates of the
% {\sl Sync\TeX} records.

@x
@d append_native(#)==begin native_text[native_len]:=#; incr(native_len); end
@y
@d append_native(#)==begin native_text[native_len]:=#; prov_buf_set(native_len, prov_cur); incr(native_len); end
@z

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
      if p <> r then begin {merge nodes from |r| to |p| inclusive; total text length is |k|}
        str_room(k);
@y
      if p <> r then begin {merge nodes from |r| to |p| inclusive; total text length is |k|}
        str_room(k); prov_acc_reset;
@z

@x
              for j:=0 to native_length(q)-1 do
                append_char(get_native_char(q, j));
@y
              for j:=0 to native_length(q)-1 do begin
                append_char(get_native_char(q, j)); prov_acc_node(q, j); end;
@z

@x
            append_char(" ");
            g:=glue_ptr(q);
@y
            append_char(" "); prov_acc_val(0);
            g:=glue_ptr(q);
@z

@x
        for j:=0 to cur_length - 1 do
          set_native_char(q, j, str_pool[str_start_macro(str_ptr) + j]);
@y
        for j:=0 to cur_length - 1 do
          set_native_char(q, j, str_pool[str_start_macro(str_ptr) + j]);
        prov_from_acc(q);
@z

@x
page_loc:=dvi_offset+dvi_ptr;
dvi_out(bop);
@y
page_loc:=dvi_offset+dvi_ptr;
prov_page;
dvi_out(bop);
@z

@x
  native_glyph_count(q):=0;
  native_glyph_info_ptr(q):=null_ptr;

  new_native_word_node:=q;
@y
  native_glyph_count(q):=0;
  native_glyph_info_ptr(q):=null_ptr;
  prov_node_new(q, n);

  new_native_word_node:=q;
@z

@x
    native_size(p):=native_node_size + 1;
    native_glyph_count(p):=0;
@y
    native_size(p):=native_node_size + 1;
    prov_node_new(p, 2);
    native_glyph_count(p):=0;
@z

@x
      set_native_char(tail, i, native_text[s + i]);
@y
      begin set_native_char(tail, i, native_text[s + i]); prov_from_buf(tail, i, s + i); end;
@z

@x
          set_native_char(tail, i - prevOffs, native_text[s + i]);
@y
          begin set_native_char(tail, i - prevOffs, native_text[s + i]); prov_from_buf(tail, i - prevOffs, s + i); end;
@z

@x
    set_native_char(q, i - l, get_native_char(ha, i));
@y
    begin set_native_char(q, i - l, get_native_char(ha, i)); prov_from_node(q, i - l, ha, i); end;
@z

@x
      set_native_char(q, i, get_native_char(ha, i + hyphen_passed));
@y
      begin set_native_char(q, i, get_native_char(ha, i + hyphen_passed)); prov_from_node(q, i, ha, i + hyphen_passed); end;
@z

@x
  set_native_char(q, i, get_native_char(ha, i + hyphen_passed));
@y
  begin set_native_char(q, i, get_native_char(ha, i + hyphen_passed)); prov_from_node(q, i, ha, i + hyphen_passed); end;
@z

@x
    main_k:=apply_mapping(font_mapping[main_f], native_text, native_len);
    native_len:=0;
@y
    main_k:=apply_mapping(font_mapping[main_f], native_text, native_len);
    prov_map(native_len, main_k);
    native_len:=0;
@z

@x
      append_native(mapped_text[main_p]);
@y
      append_native(mapped_text[main_p]); prov_buf_set(native_len - 1, prov_map_get(main_p));
@z

@x
          append_native(get_native_char(main_pp, main_p));
        for main_p:=0 to main_h - 1 do
          append_native(native_text[temp_ptr + main_p]);
@y
          begin append_native(get_native_char(main_pp, main_p)); prov_buf_from_node(native_len - 1, main_pp, main_p); end;
        for main_p:=0 to main_h - 1 do
          begin append_native(native_text[temp_ptr + main_p]); prov_buf_copy(native_len - 1, temp_ptr + main_p); end;
@z

@x
        set_native_char(tail, main_p, get_native_char(main_pp, main_p));
@y
        begin set_native_char(tail, main_p, get_native_char(main_pp, main_p)); prov_from_node(tail, main_p, main_pp, main_p); end;
@z

@x
        set_native_char(tail, main_p + native_length(main_pp), native_text[main_p]);
@y
        begin set_native_char(tail, main_p + native_length(main_pp), native_text[main_p]); prov_from_buf(tail, main_p + native_length(main_pp), main_p); end;
@z

@x
        set_native_char(tail, main_p, native_text[main_p]);
@y
        begin set_native_char(tail, main_p, native_text[main_p]); prov_from_buf(tail, main_p, main_p); end;
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
  copy_native_glyph_info(p, r);
@y
  copy_native_glyph_info(p, r);
  prov_node_copy(r, p);
@z

@x
native_word_node, native_word_node_AT: begin free_native_glyph_info(p); free_node(p,native_size(p)); end;
@y
native_word_node, native_word_node_AT: begin free_native_glyph_info(p); prov_node_free(p); free_node(p,native_size(p)); end;
@z

@x
            set_native_char(pp, total_chars, get_native_char(ppp, k));
@y
            set_native_char(pp, total_chars, get_native_char(ppp, k)); prov_from_node(pp, total_chars, ppp, k);
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
for k:=str_start_macro(str_ptr) to pool_ptr-1 do dvi_out(so(str_pool[k]));
pool_ptr:=str_start_macro(str_ptr); {erase the string}
@y
for k:=str_start_macro(str_ptr) to pool_ptr-1 do dvi_out(so(str_pool[k]));
prov_special(str_start_macro(str_ptr), pool_ptr);
pool_ptr:=str_start_macro(str_ptr); {erase the string}
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
