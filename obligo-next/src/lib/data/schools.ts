export type SchoolOption = {
  name: string;
  aliases?: string[];
};

// A pragmatic “real” starter dataset (expand later with a proper seed/source).
// Keep this local so onboarding works instantly and offline.
export const SCHOOL_OPTIONS: SchoolOption[] = [
  { name: "Harvard University", aliases: ["Harvard"] },
  { name: "Stanford University", aliases: ["Stanford"] },
  { name: "Massachusetts Institute of Technology", aliases: ["MIT"] },
  { name: "Princeton University", aliases: ["Princeton"] },
  { name: "Yale University", aliases: ["Yale"] },
  { name: "Columbia University", aliases: ["Columbia"] },
  { name: "University of Pennsylvania", aliases: ["UPenn", "Penn"] },
  { name: "Dartmouth College", aliases: ["Dartmouth"] },
  { name: "Brown University", aliases: ["Brown"] },
  { name: "Cornell University", aliases: ["Cornell"] },

  { name: "University of Chicago", aliases: ["UChicago"] },
  { name: "Duke University", aliases: ["Duke"] },
  { name: "California Institute of Technology", aliases: ["Caltech"] },
  { name: "Johns Hopkins University", aliases: ["Johns Hopkins", "JHU"] },
  { name: "Northwestern University", aliases: ["Northwestern"] },
  { name: "New York University", aliases: ["NYU"] },
  { name: "University of Southern California", aliases: ["USC"] },
  { name: "Carnegie Mellon University", aliases: ["CMU", "Carnegie Mellon"] },
  { name: "Georgetown University", aliases: ["Georgetown"] },
  { name: "Rice University", aliases: ["Rice"] },

  { name: "University of California, Berkeley", aliases: ["UC Berkeley", "Berkeley"] },
  { name: "University of California, Los Angeles", aliases: ["UCLA"] },
  { name: "University of California, San Diego", aliases: ["UCSD"] },
  { name: "University of California, Santa Barbara", aliases: ["UCSB"] },
  { name: "University of California, Irvine", aliases: ["UCI"] },
  { name: "University of California, Davis", aliases: ["UC Davis"] },
  { name: "University of California, Santa Cruz", aliases: ["UCSC"] },
  { name: "University of California, Riverside", aliases: ["UCR"] },
  { name: "University of California, Merced", aliases: ["UC Merced"] },

  { name: "University of Michigan", aliases: ["Michigan", "UMich"] },
  { name: "University of Virginia", aliases: ["UVA"] },
  { name: "University of North Carolina at Chapel Hill", aliases: ["UNC", "UNC Chapel Hill"] },
  { name: "Georgia Institute of Technology", aliases: ["Georgia Tech", "Gatech"] },
  { name: "University of Texas at Austin", aliases: ["UT Austin"] },
  { name: "University of Florida", aliases: ["UF"] },
  { name: "University of Washington", aliases: ["UW"] },
  { name: "University of Illinois Urbana-Champaign", aliases: ["UIUC", "Illinois"] },
  { name: "University of Wisconsin-Madison", aliases: ["UW Madison", "Wisconsin"] },
  { name: "Purdue University", aliases: ["Purdue"] },

  { name: "Pennsylvania State University", aliases: ["Penn State"] },
  { name: "Ohio State University", aliases: ["OSU", "Ohio State"] },
  { name: "Michigan State University", aliases: ["MSU", "Michigan State"] },
  { name: "Indiana University Bloomington", aliases: ["IU", "Indiana University"] },
  { name: "University of Maryland, College Park", aliases: ["UMD", "Maryland"] },
  { name: "University of Minnesota Twin Cities", aliases: ["UMN", "Minnesota"] },
  { name: "University of Georgia", aliases: ["UGA", "Georgia"] },
  { name: "University of Colorado Boulder", aliases: ["CU Boulder"] },
  { name: "University of Arizona", aliases: ["Arizona", "UArizona"] },
  { name: "Arizona State University", aliases: ["ASU", "Arizona State"] },

  { name: "Boston University", aliases: ["BU"] },
  { name: "Northeastern University", aliases: ["Northeastern"] },
  { name: "Tufts University", aliases: ["Tufts"] },
  { name: "Brandeis University", aliases: ["Brandeis"] },
  { name: "Boston College", aliases: ["BC"] },

  { name: "Washington University in St. Louis", aliases: ["WashU", "Washington University"] },
  { name: "Vanderbilt University", aliases: ["Vanderbilt"] },
  { name: "Emory University", aliases: ["Emory"] },
  { name: "University of Notre Dame", aliases: ["Notre Dame"] },

  { name: "University of Miami", aliases: ["Miami"] },
  { name: "Florida State University", aliases: ["FSU", "Florida State"] },
  { name: "University of Central Florida", aliases: ["UCF"] },

  { name: "University of Iowa", aliases: ["Iowa"] },
  { name: "University of Kansas", aliases: ["Kansas", "KU"] },
  { name: "University of Kentucky", aliases: ["Kentucky", "UK"] },
  { name: "University of Tennessee, Knoxville", aliases: ["Tennessee", "UTK"] },

  { name: "Virginia Tech", aliases: ["VT"] },
  { name: "University of Massachusetts Amherst", aliases: ["UMass Amherst", "UMass"] },
  { name: "Rensselaer Polytechnic Institute", aliases: ["RPI"] },
  { name: "Rochester Institute of Technology", aliases: ["RIT"] },

  { name: "University of Rochester", aliases: ["Rochester"] },
  { name: "Case Western Reserve University", aliases: ["Case Western", "CWRU"] },
  { name: "Wake Forest University", aliases: ["Wake Forest"] },
  { name: "Tulane University", aliases: ["Tulane"] },
  { name: "University of Pittsburgh", aliases: ["Pitt"] },

  { name: "University of Oregon", aliases: ["Oregon", "UO"] },
  { name: "Oregon State University", aliases: ["OSU", "Oregon State"] },
  { name: "Washington State University", aliases: ["WSU"] },

  { name: "University of Alabama", aliases: ["Alabama", "UA"] },
  { name: "Auburn University", aliases: ["Auburn"] },
  { name: "Clemson University", aliases: ["Clemson"] },
  { name: "University of South Carolina", aliases: ["South Carolina", "USC Columbia"] },

  { name: "Texas A&M University", aliases: ["Texas A&M", "TAMU"] },
  { name: "University of Houston", aliases: ["UH"] },
  { name: "Baylor University", aliases: ["Baylor"] },
  { name: "Southern Methodist University", aliases: ["SMU"] },
  { name: "Texas Tech University", aliases: ["Texas Tech"] },

  { name: "University of Oklahoma", aliases: ["Oklahoma", "OU"] },
  { name: "Oklahoma State University", aliases: ["OSU", "Oklahoma State"] },

  { name: "Iowa State University", aliases: ["Iowa State"] },
  { name: "Kansas State University", aliases: ["Kansas State", "K-State"] },
  { name: "University of Nebraska-Lincoln", aliases: ["Nebraska", "UNL"] },

  { name: "University of Connecticut", aliases: ["UConn"] },
  { name: "University of Vermont", aliases: ["UVM", "Vermont"] },
  { name: "Syracuse University", aliases: ["Syracuse"] },
];
