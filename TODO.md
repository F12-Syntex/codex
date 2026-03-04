1: novel downloader
2: ai chapter rename
3: ai text formatter / character tagging

<!-- now lets add a new ai feature called ai wiki, when enabled uses ai to create a wiki for the entire book, characters, who they are, what they do, how they speak, examples, plot, items, very detailed! as well as a way to attach      
  chapter number to the particular konwledge item, this is very important for 2 of our ai features, 1: ai wiki will build internally then ALL charactesr/items/places will be rendered in a custom way ( colour ) hovering over         
  gives a short description of who the character / item / place is in context of the current chapter, using information that's accured in the chapter OR before, NOT beyond to avoid spooilerts, 2: our second feature called ai           simulate, this lets us talk and simulate a senario for a character with everything that's happend so far, for example, mid fight, i can simulate the enemy instanly dieing then introducing myself, ai simualte then simulates how     
   the character will react essentiually creating a branch in the story, which the user can enjoy ( this branch story is saved to be read later / epanded ) we're not going to implement ai simualte just yet, but bare it in mind,        keep track of the concept, 3: ai buddy, which is essentially a companion that you can talk to and ask questions regarding the novel, "does the mc get really strong?" "when do things get more interesting" etc ofcourse, we're        
  not implemneting this yet, just bare it in mind since we need the wiki to be extremely detialed, and llm optmiised, so i can easily add new things if needed AND the wiki stores important information, plot points, character         
  data, etc   -->


  
<!-- ❯ lets do this, delete the entire ai formatting, and remake it from scratch, i want to ensure clean code, scalable and good, here is the jist of it 1: ai actually determines what to format just like lasttime 2: format dictionary     
   comes back, but it's universal this time, 3: a much better ux for the modifying, i don't want to regenerate and have the name change and the card moved, or the text being inco -->