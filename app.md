# wordle-pal-2.0

wordle-pal-2.0 (henceforth wp2) should be a stripped-down version of the wordle-pal react app defined in https://github.com/ramakocherlakota/wordle-pal/tree/main/wordle-react-app.  

wp3 uses the supplied wordle-svc back end to rate a user's guesses in a standard wordle puzzle for how lucky they were.

1. wp2 should be a modern react app with aesthetically pleasing styling.
2. code should be in typescript and all code should have adequate unit test coverage.
3. wp2 should only be the front end app - the back end should be supplied by the same wordle-svc called (https://github.com/ramakocherlakota/wordle-pal/tree/main/wordle-svc) called by wordle-al.
4. The workflow for the app should look something like this: the user selects a target word from the list of possible answers in ../wordle-react-app/src/data/AnswerOptions.js.  In the legacy app this is done using a select rather than allowing the user to type in a word, using the WordSelect component.  Something like that would be desirable.
5. Once a target word is selected, the user should select the words that were guessed, again using the same kind of word-selection widget.  The options here should be from GuessOptions.js in the same directory, except there is a bug in the legacy code so that not all the words are in that list - the actual list of possible guess words should be the union of the words in GuessOptions and AnswerrOptions.  You can hardcode the lists of allowed possible answers and guesses rather than querying them from the backend.
6. In a standard Wordle game the user has only six tries to guess the word but in other variations of the game (quordle etc) more than six tries are allowed.  I recommend displaying six guess-selection widgets with a button to add more guesses if the user wants.
7. Once the user has selected the target and guesses, they should click on a Submit button which will trigger a call to the backend.  Appropriate "waiting" feedback should be given to the user since this backend call can take time.  The backend request should parallel the one invoked from ../wordle-pal/wordle-react-app/src/GoButton.js.  
8. Once the request is made and results are retrieved successfully they should be displayed in a chart that looks like:

GUESS   |  SCORE  |  LUCK  | REMAINING

where the guess, score and luck come back from the back end (luck should be truncated to 3 decimal places).  Under REMAINING should be a button the user can press to open a popup populated by the list of remaining possible words.  See ../wordle-pal/wordle-react-app/src/Remaining.js for how this data is retrieved is done in the legacy app.

9. There should also be a Clear button the clears the target and guesses.
